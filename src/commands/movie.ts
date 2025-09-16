import { SlashCommand } from '../types'
import { SlashCommandBuilder } from 'discord.js'
import { distance } from 'fastest-levenshtein'

const TMDB_API_KEY = process.env.TMDB_API_KEY

// TMDB API types (simplified)
interface TmdbMovie {
    id: number
    title: string
    release_date: string // "YYYY-MM-DD"
}

interface TmdbSearchResult {
    results: TmdbMovie[]
}

// Function to generate n-grams
function getNgrams(text: string, minSize: number, maxSize: number): string[] {
    const words = text.split(' ').filter(w => w.length > 0)
    const ngrams: string[] = []
    for (let n = maxSize; n >= minSize; n--) {
        for (let i = 0; i <= words.length - n; i++) {
            ngrams.push(words.slice(i, i + n).join(' '))
        }
    }
    return ngrams
}

async function searchTmdb(query: string): Promise<TmdbMovie[]> {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY is not configured.')
    }
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`
    const response = await fetch(url)
    if (!response.ok) {
        return []
    }
    const data: TmdbSearchResult = await response.json()
    return data.results
}

async function findAndReplaceMovies(text: string): Promise<string> {
    if (!text.trim()) return text

    const words = text.split(' ')
    const maxNgramSize = Math.min(words.length, 5)

    // --- Pass 1: Find best EXACT match ---
    const ngramsExact = getNgrams(text, 1, maxNgramSize)
    let bestExactMatch: { movie: TmdbMovie, ngram: string } | null = null

    for (const ngram of ngramsExact) {
        const movies = await searchTmdb(ngram)
        const exactMatchMovie = movies.find(movie => movie.title.toLowerCase() === ngram.toLowerCase())
        if (exactMatchMovie) {
            bestExactMatch = { movie: exactMatchMovie, ngram }
            break // Since ngrams are longest to shortest, first exact match is the best one.
        }
    }

    if (bestExactMatch) {
        const { movie, ngram } = bestExactMatch
        const year = movie.release_date ? ` (${movie.release_date.substring(0, 4)})` : ''
        const replacement = `${movie.title}${year}`
        const matchIndex = text.toLowerCase().indexOf(ngram.toLowerCase())
        const beforeText = text.substring(0, matchIndex)
        const afterText = text.substring(matchIndex + ngram.length)

        return (await findAndReplaceMovies(beforeText)) + replacement + (await findAndReplaceMovies(afterText))
    }

    // --- Pass 2: Find best FUZZY match (if no exact match found) ---
    const ngramsFuzzy = getNgrams(text, 2, maxNgramSize) // Only use n-grams of 2 or more words for fuzzy
    let bestFuzzyMatch: { movie: TmdbMovie, ngram: string, distance: number } | null = null
    let lowestDistance = Infinity

    for (const ngram of ngramsFuzzy) {
        const movies = await searchTmdb(ngram)
        if (movies.length === 0) continue

        for (const movie of movies) {
            if (!movie.title) continue

            const ngramWords = ngram.split(' ').length
            const titleWords = movie.title.split(' ').length
            if (Math.abs(ngramWords - titleWords) > 1) continue // Word count must be close

            const currentDistance = distance(ngram.toLowerCase(), movie.title.toLowerCase())

            if (currentDistance < lowestDistance) {
                lowestDistance = currentDistance
                bestFuzzyMatch = { movie, ngram, distance: currentDistance }
            }
        }
    }

    // Check if the best fuzzy match is good enough
    if (bestFuzzyMatch) {
        const { movie, ngram, distance } = bestFuzzyMatch

        const isGoodFuzzyMatch =
            (ngram.length > 8 && distance <= 2) ||
            (ngram.length > 4 && distance <= 1)

        if (isGoodFuzzyMatch) {
            const year = movie.release_date ? ` (${movie.release_date.substring(0, 4)})` : ''
            const replacement = `${movie.title}${year}`
            const matchIndex = text.indexOf(ngram)
            const beforeText = text.substring(0, matchIndex)
            const afterText = text.substring(matchIndex + ngram.length)

            return (await findAndReplaceMovies(beforeText)) + replacement + (await findAndReplaceMovies(afterText))
        }
    }

    // No good matches found
    return text
}


export default {
    data: new SlashCommandBuilder()
        .setName('movie')
        .setDescription('Corrects movie titles in a sentence and adds the release year.')
        .addStringOption(option => option
            .setName('text')
            .setDescription('The text to process.')
            .setRequired(true)
        ),
    async execute(ctx) {
        if (!process.env.TMDB_API_KEY) {
            await ctx.reply('❌ The TMDB API key is not configured. Please contact the bot owner.')
            return
        }

        await ctx.deferReply()

        const inputText = ctx.getStringOption('text', true)

        const correctedText = await findAndReplaceMovies(inputText)

        if (inputText === correctedText) {
            await ctx.editReply(`Could not find any confident movie matches in "${inputText}".`)
        } else {
            await ctx.editReply(correctedText)
        }
    }
} satisfies SlashCommand
