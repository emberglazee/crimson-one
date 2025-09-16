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
        const words = inputText.split(' ')
        const ngrams = getNgrams(inputText, 1, words.length)

        let bestMatch = {
            score: -1,
            movie: null as TmdbMovie | null,
            ngram: ''
        }

        for (const ngram of ngrams) {
            const movies = await searchTmdb(ngram)
            if (movies.length > 0) {
                for (const movie of movies) {
                    const d = distance(ngram.toLowerCase(), movie.title.toLowerCase())
                    // Score prioritizes longer ngrams and lower distance
                    const score = (ngram.length ** 2) / (d + 1)

                    if (score > bestMatch.score) {
                        bestMatch = { score, movie, ngram }
                    }
                }
            }
        }

        // Set a threshold for what a "good" score is.
        // A perfect match (distance 0) for an 8-char ngram has score 64.
        // A distance 2 match for an 8-char ngram has score 64/3 = 21.
        // Let's say a score > 10 is a decent match.
        if (bestMatch.movie && bestMatch.score > 10) {
            const movie = bestMatch.movie
            const year = movie.release_date ? ` (${movie.release_date.substring(0, 4)})` : ''
            const correctedText = inputText.replace(bestMatch.ngram, `${movie.title}${year}`)
            await ctx.editReply(correctedText)
        } else {
            await ctx.editReply(`Could not find a confident movie match in "${inputText}".`)
        }
    }
} satisfies SlashCommand
