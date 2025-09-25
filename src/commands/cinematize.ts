import { SlashCommand } from '../types'
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { distance } from 'fastest-levenshtein'
import { ProgressTracker } from '../modules'

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

async function findAndReplaceMovies(
    text: string,
    progress?: { tracker: ProgressTracker, processed: number, total: number },
    timings?: { tmdbApiLatencies: number[], algorithmOverheads: number[] }
): Promise<string> {
    if (!text.trim()) return text

    const words = text.split(' ')
    const maxNgramSize = Math.min(words.length, 5)

    // --- Pass 1: Find best EXACT match ---
    const ngramsExact = getNgrams(text, 1, maxNgramSize)
    let bestExactMatch: { movie: TmdbMovie, ngram: string } | null = null

    for (const ngram of ngramsExact) {
        const overheadIterationStart = Date.now()
        if (progress) {
            progress.processed++
            await progress.tracker.update({ current: progress.processed, total: progress.total, statusText: `Searching for exact match: "${ngram}"` })
        }

        const apiCallStart = Date.now()
        const movies = await searchTmdb(ngram)
        if (timings) timings.tmdbApiLatencies.push(Date.now() - apiCallStart)

        if (progress) progress.tracker.recordStep() // Record step time after API call
        const exactMatchMovie = movies.find(movie => movie.title.toLowerCase() === ngram.toLowerCase())

        if (timings) {
            const apiLatency = timings.tmdbApiLatencies[timings.tmdbApiLatencies.length - 1] || 0
            timings.algorithmOverheads.push(Date.now() - overheadIterationStart - apiLatency)
        }

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

        return (await findAndReplaceMovies(beforeText, progress, timings)) + replacement + (await findAndReplaceMovies(afterText, progress, timings))
    }

    // --- Pass 2: Find best FUZZY match (if no exact match found) ---
    const ngramsFuzzy = getNgrams(text, 2, maxNgramSize) // Only use n-grams of 2 or more words for fuzzy
    let bestFuzzyMatch: { movie: TmdbMovie, ngram: string, distance: number } | null = null
    let lowestDistance = Infinity

    for (const ngram of ngramsFuzzy) {
        const overheadIterationStart = Date.now()
        if (progress) {
            progress.processed++
            await progress.tracker.update({ current: progress.processed, total: progress.total, statusText: `Searching for fuzzy match: "${ngram}"` })
        }

        const apiCallStart = Date.now()
        const movies = await searchTmdb(ngram)
        if (timings) timings.tmdbApiLatencies.push(Date.now() - apiCallStart)

        if (progress) progress.tracker.recordStep() // Record step time after API call
        if (movies.length === 0) {
            if (timings) {
                const apiLatency = timings.tmdbApiLatencies[timings.tmdbApiLatencies.length - 1] || 0
                timings.algorithmOverheads.push(Date.now() - overheadIterationStart - apiLatency)
            }
            continue
        }

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
        if (timings) {
            const apiLatency = timings.tmdbApiLatencies[timings.tmdbApiLatencies.length - 1] || 0
            timings.algorithmOverheads.push(Date.now() - overheadIterationStart - apiLatency)
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

            return (await findAndReplaceMovies(beforeText, progress, timings)) + replacement + (await findAndReplaceMovies(afterText, progress, timings))
        }
    }

    // No good matches found
    return text
}


export default {
    data: new SlashCommandBuilder()
        .setName('cinematize')
        .setDescription('Replaces phrases in your text with movie titles.')
        .addStringOption(option => option
            .setName('text')
            .setDescription('The text to process.')
            .setRequired(true)
            .setMaxLength(1000)
        ),
    async execute(ctx) {
        if (!process.env.TMDB_API_KEY) {
            await ctx.reply('❌ The TMDB API key is not configured. Please contact the bot owner.')
            return
        }

        const creationTimestamp = ctx.interaction?.createdTimestamp ?? ctx.message!.createdTimestamp
        await ctx.deferReply()
        const commandLatency = Date.now() - creationTimestamp

        const inputText = ctx.getStringOption('text', true)

        if (inputText.length > 1000) {
            await ctx.reply({ content: '❌ The input text cannot be longer than 1000 characters.', ephemeral: true })
            return
        }

        const useProgress = inputText.length > 40
        let progress: { tracker: ProgressTracker, processed: number, total: number } | undefined
        if (useProgress) {
            const tracker = new ProgressTracker(ctx, 'Cinematizing text...')
            const words = inputText.split(' ')
            const maxNgramSize = Math.min(words.length, 5)
            const ngramsExact = getNgrams(inputText, 1, maxNgramSize)
            const ngramsFuzzy = getNgrams(inputText, 2, maxNgramSize)
            const total = ngramsExact.length + ngramsFuzzy.length
            progress = { tracker, processed: 0, total }
        }

        const timings = {
            tmdbApiLatencies: [] as number[],
            algorithmOverheads: [] as number[]
        }

        const totalTimeStart = Date.now()
        const correctedText = await findAndReplaceMovies(inputText, progress, timings)
        const totalTime = Date.now() - totalTimeStart

        if (progress) {
            await progress.tracker.finish(correctedText)
        } else {
            await ctx.editReply(correctedText)
        }

        if (ctx.botSettingsManager.isDebugModeEnabled()) {
            const { tmdbApiLatencies, algorithmOverheads } = timings
            const avgTmdbLatency = tmdbApiLatencies.length > 0 ? tmdbApiLatencies.reduce((a, b) => a + b, 0) / tmdbApiLatencies.length : 0
            const avgAlgoOverhead = algorithmOverheads.length > 0 ? algorithmOverheads.reduce((a, b) => a + b, 0) / algorithmOverheads.length : 0

            const embed = new EmbedBuilder()
                .setTitle('Cinematize Debug Timings')
                .addFields(
                    { name: 'Command Latency', value: `${commandLatency}ms`, inline: true },
                    { name: 'Total Time', value: `${totalTime}ms`, inline: true },
                    { name: 'Avg TMDB API Latency', value: `${avgTmdbLatency.toFixed(2)}ms (${tmdbApiLatencies.length} calls)`, inline: false },
                    { name: 'Avg Algorithm Overhead', value: `${avgAlgoOverhead.toFixed(2)}ms (${algorithmOverheads.length} iterations)`, inline: false }
                )
                .setColor('#FFFF00')
                .setTimestamp()

            await ctx.followUp({ embeds: [embed] })
        }
    }
} satisfies SlashCommand
