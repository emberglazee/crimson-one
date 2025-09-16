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
    const words = text.split(' ')
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
        // handle error
        return []
    }
    const data: TmdbSearchResult = await response.json()
    return data.results
}

async function findAndReplaceMovies(text: string): Promise<string> {
    if (!text.trim()) {
        return text
    }

    const words = text.split(' ')
    // Limit n-gram size for performance on long inputs, e.g., max 5 words
    const maxNgramSize = Math.min(words.length, 5)
    const ngrams = getNgrams(text, 1, maxNgramSize)

    let bestMatch = {
        score: -1,
        movie: null as TmdbMovie | null,
        ngram: ''
    }

    for (const ngram of ngrams) {
        const movies = await searchTmdb(ngram)
        if (movies.length > 0) {
            for (const movie of movies) {
                if (!movie.title) continue
                const d = distance(ngram.toLowerCase(), movie.title.toLowerCase())
                const score = (ngram.length ** 2) / (d + 1)

                if (score > bestMatch.score) {
                    bestMatch = { score, movie, ngram }
                }
            }
        }
    }

    // Threshold for a confident match
    const SCORE_THRESHOLD = 10

    if (bestMatch.movie && bestMatch.score > SCORE_THRESHOLD) {
        const movie = bestMatch.movie
        const year = movie.release_date ? ` (${movie.release_date.substring(0, 4)})` : ''
        const replacement = `${movie.title}${year}`

        const matchIndex = text.indexOf(bestMatch.ngram)

        if (matchIndex === -1) {
            // Should not happen if ngram is from text, but as a safeguard
            return text
        }

        const beforeText = text.substring(0, matchIndex)
        const afterText = text.substring(matchIndex + bestMatch.ngram.length)

        // Recursively process the parts before and after the matched ngram
        const processedBeforeText = await findAndReplaceMovies(beforeText)
        const processedAfterText = await findAndReplaceMovies(afterText)

        return processedBeforeText + replacement + processedAfterText
    } else {
        // No confident match found in this segment
        return text
    }
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
