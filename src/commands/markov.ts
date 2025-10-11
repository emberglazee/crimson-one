import { Logger, type CommandContext, ProgressTracker, InteractionMessageManager } from '../modules'
import { yellow, red } from '../util/colors'
const logger = new Logger('/markov')

import { ChannelType, SlashCommandBuilder, TextChannel, EmbedBuilder, InteractionContextType } from 'discord.js'

import { google, type youtube_v3 } from 'googleapis'
import type { GaxiosResponseWithHTTP2 } from 'googleapis-common'

import { RustMarkovChain } from '../modules/MarkovChain/RustChain'
import { SlashCommand } from '../types'
import { extractVideoId, formatYoutubeComment } from '../util/functions'


// To prevent multiple concurrent collections
let isCollectingAll = false

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
const youtubeCommentCache = new Map<string, { comments: string[], video: youtube_v3.Schema$Video, timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

async function getYouTubeComments(videoId: string, ctx: CommandContext<true>): Promise<{ comments: string[], video: youtube_v3.Schema$Video }> {
    const cached = youtubeCommentCache.get(videoId)
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        logger.info(`Using cached comments for video ID ${videoId}`)
        await ctx.editReply(`✅ Using ${cached.comments.length} cached comments.`)
        return { comments: cached.comments, video: cached.video }
    }

    const youtube = google.youtube({
        version: 'v3',
        auth: YOUTUBE_API_KEY
    })

    const videoResponse = await youtube.videos.list({
        part: ['statistics', 'snippet'],
        id: [videoId]
    })

    const video = videoResponse.data.items?.[0]
    if (!video || !video.statistics || !video.snippet) {
        throw new Error('Could not retrieve video details.')
    }

    const commentCount = parseInt(video.statistics.commentCount ?? '0')

    if (commentCount === 0) {
        return { comments: [], video }
    }

    const progressTracker = new ProgressTracker(ctx, 'Fetching comments from YouTube video...')
    const comments: string[] = []
    let nextPageToken: string | null | undefined = null
    let fetchedCount = 0

    do {
        const commentThreadResponse: GaxiosResponseWithHTTP2<youtube_v3.Schema$CommentThreadListResponse> = await youtube.commentThreads.list({
            part: ['snippet'],
            videoId: videoId,
            order: 'time',
            maxResults: 100,
            pageToken: nextPageToken ?? undefined
        })

        if (commentThreadResponse.data.items) {
            for (const item of commentThreadResponse.data.items) {
                const commentText = item.snippet?.topLevelComment?.snippet?.textDisplay
                if (commentText) {
                    comments.push(formatYoutubeComment(commentText))
                }
            }
            fetchedCount += commentThreadResponse.data.items.length
            progressTracker.recordStep()
            await progressTracker.update({ current: fetchedCount, total: commentCount })
        }

        nextPageToken = commentThreadResponse.data.nextPageToken
    } while (nextPageToken)

    await progressTracker.finish(`✅ Fetched ${comments.length} comments.`)

    youtubeCommentCache.set(videoId, { comments, video, timestamp: Date.now() })

    return { comments, video }
}


// Markov event types
interface MarkovCollectProgressEvent {
    batchNumber: number
    messagesCollected: number
    totalCollected: number
    limit: number | 'entire'
    percentComplete: number
    channelName: string
    startTime: number
    elapsedTime: number
    messagesPerSecond: number
    estimatedTimeRemaining: number | null
    taskId: string
}
interface MarkovCollectCompleteEvent {
    totalCollected: number
    channelName: string
    userFiltered: boolean
    entireChannel: boolean
    newMessagesOnly: boolean
    totalMessageCount?: number
    taskId: string
}

export default {
    data: new SlashCommandBuilder()
        .setName('markov')
        .setDescription('Generate text using Markov chains trained on chat messages')
        .addSubcommand(subcommand => subcommand
            .setName('generate')
            .setDescription('Create a new message based on collected chat data')
            .addBooleanOption(option => option
                .setName('global')
                .setDescription('Consider messages from all servers (default: false - only this server).')
                .setRequired(false)
            ).addChannelOption(option => option
                .setName('channel')
                .setDescription('Specific channel to use for message generation (ignored if \'global\' is true).')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(option => option
                .setName('user')
                .setDescription('Generate text in the style of a specific user')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(option => option
                .setName('words')
                .setDescription('How many words to generate (default: 30)')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('seed')
                .setDescription('Start the generated text with specific words')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('mode')
                .setDescription('The generation mode to use (default: trigram)')
                .setRequired(false)
                .addChoices(
                    { name: 'Trigram (default)', value: 'trigram' },
                    { name: 'Bigram (classic)', value: 'bigram' }
                )
            )
        ).addSubcommand(subcommand => subcommand
            .setName('stats')
            .setDescription('View statistics about available message data')
            .addBooleanOption(option => option
                .setName('global')
                .setDescription('Consider all messages from all servers (default: false - just this server)')
                .setRequired(false)
            ).addChannelOption(option => option
                .setName('channel')
                .setDescription('Specific channel to view statistics for (ignored if \'global\' is true).')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(option => option
                .setName('user')
                .setDescription('View statistics for a specific user\'s messages')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('collect')
            .setDescription('Gathers messages to train the Markov chain')
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('The channel to collect messages from.')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(option => option
                .setName('user')
                .setDescription('Only collect messages from this user.')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('user_id')
                .setDescription('The ID of the user to use if they are not in the server.')
                .setRequired(false)
            ).addIntegerOption(option => option
                .setName('limit')
                .setDescription('Maximum number of messages to collect (default: 1000)')
                .setRequired(false)
            ).addBooleanOption(option => option
                .setName('entire_channel')
                .setDescription('Collect every message from the channel (ignores limit)')
                .setRequired(false)
            ).addBooleanOption(option => option
                .setName('force_rescan')
                .setDescription('Force a full rescan, ignoring previously collected messages.')
                .setRequired(false)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('collect_all')
            .setDescription('Collect messages from every text channel and thread in the server')
            .addUserOption(option => option
                .setName('user')
                .setDescription('Only collect messages from this user')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(option => option
                .setName('limit')
                .setDescription('Maximum number of messages to collect per channel (default: 1000)')
                .setRequired(false)
            ).addBooleanOption(option => option
                .setName('entire_channel')
                .setDescription('Collect every message from every channel (ignores limit)')
                .setRequired(false)
            ).addBooleanOption(option => option
                .setName('force_rescan')
                .setDescription('Force a full rescan, ignoring previously collected messages.')
                .setRequired(false)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('youtube_video')
            .setDescription('Generate a message from comments of a YouTube video.')
            .addStringOption(option => option
                .setName('url')
                .setDescription('The URL of the YouTube video.')
                .setRequired(true)
            )
            .addIntegerOption(option => option
                .setName('words')
                .setDescription('How many words to generate (default: 30)')
                .setRequired(false)
            )
            .addStringOption(option => option
                .setName('seed')
                .setDescription('Start the generated text with specific words')
                .setRequired(false)
            )
            .addStringOption(option => option
                .setName('mode')
                .setDescription('The generation mode to use (default: trigram)')
                .setRequired(false)
                .addChoices(
                    { name: 'Trigram (default)', value: 'trigram' },
                    { name: 'Bigram (classic)', value: 'bigram' }
                )
            )
        ).addSubcommand(subcommand => subcommand
            .setName('youtube_video_stats')
            .setDescription('View statistics about the comments of a YouTube video.')
            .addStringOption(option => option
                .setName('url')
                .setDescription('The URL of the YouTube video.')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('help')
            .setDescription('Detailed information about the command.')
        ).setContexts(InteractionContextType.Guild),
    async execute(ctx: CommandContext<true>) {

        const subcommand = ctx.getSubcommand()
        const markov = ctx.markovChat

        // Helper to resolve user from picker or user_id
        async function resolveUserOrId() {
            const user = await ctx.getUserOption('user', false, undefined)
            const userId = ctx.getStringOption('user_id', false, undefined)
            if (user) return user
            if (userId) {
                try {
                    // Try to fetch user from Discord (may fail if user is not cached)
                    return await ctx.client.users.fetch(userId)
                } catch {
                    // If not found, just return the ID for DB filtering
                    return { id: userId }
                }
            }
            return undefined
        }

        if (subcommand === 'generate') {
            const userOrId = await resolveUserOrId()
            const user = userOrId && 'tag' in userOrId ? userOrId : undefined
            const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
            const global = ctx.getBooleanOption('global', false, false)
            const channel = global ? undefined : (await ctx.getChannelOption('channel')) as TextChannel | null ?? undefined
            const words = ctx.getIntegerOption('words', false, 30)
            const seed = ctx.getStringOption('seed', false) ?? undefined
            const mode = ctx.getStringOption('mode', false, 'trigram') as 'trigram' | 'bigram'

            await ctx.deferReply()

            try {
                logger.info(`Generating message with global: ${yellow(global)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}, words: ${yellow(words)}, seed: ${yellow(seed)}`)

                const progressTracker = new ProgressTracker(ctx, 'Generating message...')
                markov.on('generateProgress', (progress: any) => {
                    if (progress.step === 'training') {
                        progressTracker.update({
                            current: progress.progress,
                            total: progress.total,
                            statusText: 'Training model...'
                        })
                    }
                })

                const result = await markov.generateMessage({
                    guild: !global ? ctx.guild : undefined,
                    channel, user, userId, words, seed, global, mode
                })
                markov.removeAllListeners('generateProgress')

                if (!result) {
                    throw new Error('Generation failed to produce a result.')
                }

                const { text, timings } = result
                const totalTime = timings.db_query_ms + timings.training_ms + timings.generation_ms
                logger.ok(`Generated message: ${yellow(text)}`)

                const footerEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .addFields(
                        {
                            name: 'Time taken',
                            value: `**Database:** \`${timings.db_query_ms.toFixed(0)}ms\`\n` +
                                   `**Training:** \`${timings.training_ms.toFixed(0)}ms\`\n` +
                                   `**Generation:** \`${timings.generation_ms.toFixed(0)}ms\`\n` +
                                   `**Total: \`${totalTime.toFixed(0)}ms\`**`,
                            inline: true
                        },
                        {
                            name: 'Filters',
                            value: [
                                global ? 'Global' : 'This server',
                                channel ? `Channel: #${channel.name ?? channel.id}` : null,
                                user ? `User: @${user.tag}` : userId ? `User ID: ${userId}` : null,
                                words !== 30 ? `Words: ${words}` : null,
                                seed ? `Seed: "${seed}"` : null,
                                `Mode: ${mode}`
                            ].filter(Boolean).join(', ') || 'None',
                            inline: false
                        }
                    )
                    .setTimestamp()

                await progressTracker.finish({
                    content: text,
                    embeds: [footerEmbed],
                    allowedMentions: {
                        parse: []
                    }
                })
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                logger.warn(`Failed to generate message: ${red(errorMessage)}`)

                let userFriendlyError = `❌ Failed to generate message: ${errorMessage}`
                if (errorMessage.includes('No messages found')) {
                    userFriendlyError = '❌ No messages found for the selected filters. Try collecting some messages first!'
                }

                await ctx.editReply({ content: userFriendlyError })
            }

        } else if (subcommand === 'stats') {
            const userOrId = await resolveUserOrId()
            const user = userOrId && 'tag' in userOrId ? userOrId : undefined
            const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
            const global = ctx.getBooleanOption('global', false, false)
            const channel = global ? undefined : (await ctx.getChannelOption('channel')) as TextChannel | null ?? undefined

            await ctx.deferReply()

            try {
                logger.info(`Getting Markov info with global: ${yellow(global)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}`)
                const timeStart = process.hrtime()

                const progressTracker = new ProgressTracker(ctx, 'Gathering statistics...')
                markov.on('infoProgress', (progress: any) => {
                    if (progress.step === 'processing') {
                        progressTracker.update({
                            current: progress.progress,
                            total: progress.total,
                            statusText: 'Processing messages...'
                        })
                    }
                })

                const stats = await markov.getMessageStats({
                    guild: !global ? ctx.guild : undefined,
                    channel: channel ?? undefined,
                    user: user,
                    userId: userId,
                    global: global
                })
                markov.removeAllListeners('infoProgress')

                const timeEnd = process.hrtime(timeStart)
                const timeEndMs = timeEnd[0] * 1000 + timeEnd[1] / 1e6

                const oldestDate = stats.oldestMessageTimestamp ? new Date(stats.oldestMessageTimestamp).toLocaleString('en-GB') : 'N/A'
                const newestDate = stats.newestMessageTimestamp ? new Date(stats.newestMessageTimestamp).toLocaleString('en-GB') : 'N/A'

                const embedFields = [{ name: 'Messages', value: stats.messageCount.toLocaleString(), inline: true }]
                if (!user && !userId) embedFields.push({ name: 'Unique Authors', value: stats.authorCount.toLocaleString(), inline: true })
                if (!channel) embedFields.push({ name: 'Channels', value: stats.channelCount.toLocaleString(), inline: true })
                embedFields.push(
                    { name: 'Total Words', value: stats.totalWordCount.toLocaleString(), inline: true },
                    { name: 'Unique Words', value: stats.uniqueWordCount.toLocaleString(), inline: true },
                    { name: 'Words Per Message', value: stats.avgWordsPerMessage.toFixed(1), inline: true }
                )

                // --- Scoring System ---
                const messageCap = 50000
                const wordCap = 2000000
                const { messageCount, totalWordCount, uniqueWordCount } = stats

                const messageVolume = Math.min(1, Math.log10(messageCount) / Math.log10(messageCap))
                const wordVolume = Math.min(1, Math.log10(totalWordCount) / Math.log10(wordCap))
                const lexicalDiversity = totalWordCount > 0 ? Math.min(1, uniqueWordCount / Math.sqrt(totalWordCount)) : 0
                const score = 0.4 * messageVolume + 0.3 * wordVolume + 0.3 * lexicalDiversity

                const getScoreDetails = (s: number, type: 'bigram' | 'trigram') => {
                    const thresholds = type === 'bigram'
                        ? { excellent: 0.8, good: 0.6, ok: 0.4, poor: 0.2 }
                        : { excellent: 0.9, good: 0.7, ok: 0.5, poor: 0.3 }

                    if (s >= thresholds.excellent) return { emoji: '☑️', recommendation: 'Excellent' }
                    if (s >= thresholds.good) return { emoji: '✅', recommendation: 'Good' }
                    if (s >= thresholds.ok) return { emoji: 'ℹ️', recommendation: 'Okay' }
                    if (s >= thresholds.poor) return { emoji: '⚠️', recommendation: 'Poor' }
                    return { emoji: '❌', recommendation: 'Not Recommended' }
                }

                const bigramDetails = getScoreDetails(score, 'bigram')
                const trigramDetails = getScoreDetails(score, 'trigram')

                embedFields.push(
                    { name: 'Oldest Message', value: oldestDate, inline: false },
                    { name: 'Newest Message', value: newestDate, inline: false },
                    {
                        name: 'Model Quality Score',
                        value: `**Score:** ${score.toFixed(3)} / 1.000\n\n` +
                               '**Recommendations:**\n' +
                               `${bigramDetails.emoji} **Bigram:** ${bigramDetails.recommendation}\n` +
                               `${trigramDetails.emoji} **Trigram:** ${trigramDetails.recommendation}`,
                        inline: false
                    }
                )
                // --- End Scoring System ---

                const embed = new EmbedBuilder()
                    .setTitle('Markov Chain Data Statistics')
                    .setColor(0x0099FF)
                    .addFields(embedFields)
                    .setFooter({ text: `Generated in ${timeEndMs.toFixed(0)}ms` })
                    .setTimestamp()
                    .setDescription(`**Filters Applied:**\n${[global ? '🌐 Global' : channel ? `📝 Channel: #${channel.name}` : '🏠 This server', user ? `👤 User: @${user.tag}` : userId ? `👤 User ID: ${userId}` : null].filter(Boolean).join('\n')}`)

                logger.ok(`Generated Markov info in ${yellow(timeEndMs.toFixed(0))}ms`)
                await new InteractionMessageManager(ctx).sendFinalMessage({ content: '', embeds: [embed] })
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                logger.warn(`Failed to get Markov info: ${red(errorMessage)}`)
                let userFriendlyError = `❌ Failed to get info: ${errorMessage}`
                if (errorMessage.includes('No messages found')) {
                    userFriendlyError = '❌ No messages found for the selected filters. Try collecting some messages first!'
                }
                await ctx.editReply({ content: userFriendlyError })
            }

        } else if (subcommand === 'help') {

            type ChannelID = string & {}
            type Timestamp = number & {}
            const helpCooldowns = new Map<ChannelID, Timestamp>()
            const COOLDOWN_TIME = 60 * 1000 // 1 minute

            if (helpCooldowns.has(ctx.channel!.id)) {
                const lastUsed = helpCooldowns.get(ctx.channel!.id)!
                const remaining = COOLDOWN_TIME - (Date.now() - lastUsed)
                if (remaining > 0) {
                    await ctx.reply('❌ this command has a wall of text i get it you wanna spam it so chill out bro and try again in a minute 🥀')
                    return
                }
            }

            helpCooldowns.set(ctx.channel!.id, Date.now())

            const text = (
                '## `/markov` command\n' +
                '- A (text-based) Markov chain is a model that predicts the next word in a sequence based on the words that came before it.\n' +
                '- This bot uses the messages in servers to build a model and generate new sentences that try to mimic the style of the server members.\n' +
                '### 1. Data Collection\n' +
                '- The bot requires messages to generate sentences. More data results in more accurate and coherent generated sentences.\n' +
                '  - `/markov collect`: Collects messages from a *single* specified channel;\n' +
                '  - `/markov collect_all`: Collects messages from *all* channels accessible by the bot.\n' +
                '- **Note**: both commands have extensive options, like only collecting from a certain user, or with a certain message cap (limit). You can view them all in the slash command option suggestions.\n' +
                '### 2. Text Generation\n' +
                '  - `/markov generate`: Generate a new sentence using the Markov chain model.\n' +
                '- To support filters, the messages are stored inside a PostgreSQL database.\n' +
                '- Every time the generation command is called, messages are fetched from the database according to the filters set.\n' +
                '- Two modes of generation are supported:\n' +
                '  1. `bigram`: uses only the last word as the context to determine the next word (less coherent, effective when there are fewer messages to work with);\n' +
                '  2. `trigram` (default): uses the last two words instead (more coherent but only effective with a large number of messages (e.g., over 5,000-10,000)).\n' +
                '### 3. Statistics\n' +
                '  - `/markov stats`: Display a summary for the messages stored that match the filters (if provided).'
            )
            const followUpText = (
                '### Privacy concerns?\n' +
                '- The bot\'s code is fully open source: <https://github.com/emberglazee/crimson-one> ([my own model implementation in Rust](<https://github.com/emberglazee/crimson-one/blob/rocketman02/crimson_markov/src/lib.rs>), [this command](<https://github.com/emberglazee/crimson-one/blob/rocketman02/src/commands/markov.ts>), and [FFI and database handlers](<https://github.com/emberglazee/crimson-one/tree/rocketman02/src/modules/MarkovChain>)).\n' +
                '- The messages in the database are never manually viewed or manipulated, unless it\'s crucial for debugging an issue with the model.\n' +
                '- To request the deletion of specific data from the message database please send a Discord DM to `@emberglaze`, or an email to `emberglaze@emberglaze.ru`, with proof of server ownership, staff membership, or account ownership (if requesting deletion for yourself).\n' +
                '- Data deletion might be implemented as a bot command in the near future.'
            )
            await ctx.reply(text)
            await ctx.followUp(followUpText)

        } else if (subcommand === 'youtube_video') {
            if (!YOUTUBE_API_KEY) {
                await ctx.reply('❌ YouTube API key is not configured. Please contact the bot owner.')
                return
            }

            const videoUrl = ctx.getStringOption('url', true)
            const videoId = extractVideoId(videoUrl)

            if (!videoId) {
                await ctx.editReply('❌ Invalid YouTube video URL.')
                return
            }

            await ctx.deferReply()

            try {
                const { comments, video } = await getYouTubeComments(videoId, ctx)

                if (comments.length === 0) {
                    await ctx.editReply('No comments found on this video.')
                    return
                }

                const words = ctx.getIntegerOption('words', false, 30)
                const seed = ctx.getStringOption('seed', false) ?? undefined
                const mode = ctx.getStringOption('mode', false, 'bigram') as 'trigram' | 'bigram'

                const rustChain = new RustMarkovChain()
                try {
                    await ctx.editReply('Now generating message...')

                    const trainingStartTime = performance.now()
                    rustChain.trainBatch(comments)
                    const trainingMs = performance.now() - trainingStartTime

                    const result = rustChain.generate(words, mode, seed, 0, trainingMs)

                    if (!result) {
                        await ctx.editReply({ content: '❌ Failed to generate a message. The model might not have had enough data.' })
                        return
                    }

                    const { text, timings } = result
                    const totalTime = timings.training_ms + timings.generation_ms

                    const videoEmbed = new EmbedBuilder()
                        .setAuthor({
                            name: video.snippet!.channelTitle ?? 'Unknown Channel',
                            url: `https://www.youtube.com/channel/${video.snippet!.channelId}`
                        })
                        .setTitle(video.snippet!.title ?? 'Unknown Video')
                        .setURL(videoUrl)
                        .setThumbnail(video.snippet!.thumbnails?.default?.url ?? null)
                        .setColor('#FF0000')

                    const footerEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .addFields(
                            {
                                name: 'Generation Timings',
                                value: `Training: \`${timings.training_ms.toFixed(0)}ms\`\n` +
                                       `Generation: \`${timings.generation_ms.toFixed(0)}ms\`\n` +
                                       `**Total: \`${totalTime.toFixed(0)}ms\`**`,
                                inline: true
                            },
                            {
                                name: 'Filters',
                                value: [
                                    'Source: YouTube Video',
                                    words !== 30 ? `Words: ${words}` : null,
                                    seed ? `Seed: "${seed}"` : null,
                                    `Mode: ${mode}`
                                ].filter(Boolean).join(', ') || 'None',
                                inline: false
                            }
                        )
                        .setTimestamp()

                    await ctx.editReply({ content: text, embeds: [videoEmbed, footerEmbed] })
                } finally {
                    rustChain.destroy()
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                logger.warn(`Failed to generate message from YouTube comments: ${red(errorMessage)}`)
                await ctx.editReply(`❌ An error occurred: ${errorMessage}`)
            }
        } else if (subcommand === 'youtube_video_stats') {
            if (!YOUTUBE_API_KEY) {
                await ctx.reply('❌ YouTube API key is not configured. Please contact the bot owner.')
                return
            }

            const videoUrl = ctx.getStringOption('url', true)
            const videoId = extractVideoId(videoUrl)

            if (!videoId) {
                await ctx.editReply('❌ Invalid YouTube video URL.')
                return
            }

            await ctx.deferReply()

            try {
                const { comments, video } = await getYouTubeComments(videoId, ctx)

                if (comments.length === 0) {
                    await ctx.editReply('No comments found on this video, or failed to fetch them.')
                    return
                }

                // Calculate stats
                const messageCount = comments.length
                const allWords = comments.flatMap(c => c.split(/\s+/).filter(w => w.length > 0))
                const totalWordCount = allWords.length
                const uniqueWords = new Set(allWords.map(w => w.toLowerCase()))
                const uniqueWordCount = uniqueWords.size
                const avgWordsPerMessage = totalWordCount / messageCount

                // Model Quality Score logic from 'stats' subcommand
                const messageCap = 50000
                const wordCap = 2000000

                const messageVolume = Math.min(1, Math.log10(messageCount) / Math.log10(messageCap))
                const wordVolume = Math.min(1, Math.log10(totalWordCount) / Math.log10(wordCap))
                const lexicalDiversity = totalWordCount > 0 ? Math.min(1, uniqueWordCount / Math.sqrt(totalWordCount)) : 0
                const score = 0.4 * messageVolume + 0.3 * wordVolume + 0.3 * lexicalDiversity

                const getScoreDetails = (s: number, type: 'bigram' | 'trigram') => {
                    const thresholds = type === 'bigram'
                        ? { excellent: 0.8, good: 0.6, ok: 0.4, poor: 0.2 }
                        : { excellent: 0.9, good: 0.7, ok: 0.5, poor: 0.3 }

                    if (s >= thresholds.excellent) return { emoji: '☑️', recommendation: 'Excellent' }
                    if (s >= thresholds.good) return { emoji: '✅', recommendation: 'Good' }
                    if (s >= thresholds.ok) return { emoji: 'ℹ️', recommendation: 'Okay' }
                    if (s >= thresholds.poor) return { emoji: '⚠️', recommendation: 'Poor' }
                    return { emoji: '❌', recommendation: 'Not Recommended' }
                }

                const bigramDetails = getScoreDetails(score, 'bigram')
                const trigramDetails = getScoreDetails(score, 'trigram')

                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: video.snippet!.channelTitle ?? 'Unknown Channel',
                        url: `https://www.youtube.com/channel/${video.snippet!.channelId}`
                    })
                    .setTitle(video.snippet!.title ?? 'Unknown Video')
                    .setURL(videoUrl)
                    .setThumbnail(video.snippet!.thumbnails?.default?.url ?? null)
                    .setColor(0xFF0000) // YouTube Red
                    .addFields(
                        { name: 'Comments', value: messageCount.toLocaleString(), inline: true },
                        { name: 'Total Words', value: totalWordCount.toLocaleString(), inline: true },
                        { name: 'Unique Words', value: uniqueWordCount.toLocaleString(), inline: true },
                        { name: 'Words Per Comment', value: avgWordsPerMessage.toFixed(1), inline: true },
                        {
                            name: 'Model Quality Score',
                            value: `**Score:** ${score.toFixed(3)} / 1.000\n\n` +
                                   '**Recommendations:**\n' +
                                   `${bigramDetails.emoji} **Bigram:** ${bigramDetails.recommendation}\n` +
                                   `${trigramDetails.emoji} **Trigram:** ${trigramDetails.recommendation}`,
                            inline: false
                        }
                    )
                    .setTimestamp()

                await ctx.editReply({ embeds: [embed] })

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                logger.warn(`Failed to get stats for YouTube video: ${red(errorMessage)}`)
                await ctx.editReply(`❌ An error occurred: ${errorMessage}`)
            }
        } else if (subcommand === 'collect_all') {
            if (isCollectingAll) {
                await ctx.reply('❌ A `collect_all` operation is already in progress. Please wait for it to complete.')
                return
            }

            isCollectingAll = true
            try {
                const userOrId = await resolveUserOrId()
                const user = userOrId && 'tag' in userOrId ? userOrId : undefined
                const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
                const collectEntireChannel = ctx.getBooleanOption('entire_channel', false)
                const forceRescan = ctx.getBooleanOption('force_rescan', false, false)
                const limit = collectEntireChannel ? 'entire' : ctx.getIntegerOption('limit')

                await ctx.deferReply()
                logger.info('{collect_all} Starting collection from all channels...')

                const textChannels = (await ctx.guild.channels.fetch()).filter(c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.viewable) as Map<string, TextChannel>
                logger.ok(`{collect_all} Fetched ${yellow(textChannels.size)} text channels`)

                const threadPromises = [...textChannels.values()].map(async c => {
                    try {
                        const threads = await c.threads.fetch()
                        return threads.threads.filter(t => t.viewable)
                    } catch {
                        return []
                    }
                })
                const threads = (await Promise.all(threadPromises)).flatMap(t => [...t.values()])
                logger.ok(`{collect_all} Fetched ${yellow(threads.length)} threads`)

                const allTargets = [...textChannels.values(), ...threads]
                logger.info(`{collect_all} Total collection targets: ${yellow(allTargets.length)}`)

                const progressTracker = new ProgressTracker(ctx, 'Collecting from all channels...')
                let totalCollected = 0
                let successfulChannels = 0
                const failedChannels: { channel: string, error: string }[] = []

                for (let i = 0; i < allTargets.length; i++) {
                    const targetChannel = allTargets[i]
                    try {
                        logger.info(`Collecting from #${yellow(targetChannel.name)} (${yellow(targetChannel.id)})`)
                        const { completionPromise } = markov.collectMessages(targetChannel as TextChannel, {
                            user,
                            userId,
                            limit: limit === null ? undefined : limit,
                            forceRescan: forceRescan ?? undefined
                        })
                        const count = await completionPromise
                        logger.ok(`Collected ${yellow(count)} messages from #${yellow(targetChannel.name)}`)
                        totalCollected += count
                        successfulChannels++
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err)
                        logger.warn(`Failed to collect from #${yellow(targetChannel.name)}: ${red(errorMsg)}`)
                        failedChannels.push({ channel: targetChannel.name, error: errorMsg })
                    }

                    await progressTracker.update({
                        current: i + 1,
                        total: allTargets.length,
                        statusText: `Processed ${i + 1}/${allTargets.length} channels. ${successfulChannels} successful.`,
                        eta: null
                    })
                }

                let summary = `✅ Finished collecting from all channels and threads. Total messages collected: ${totalCollected}.`
                summary += `\nSuccessfully collected from ${successfulChannels}/${allTargets.length} channels.`
                if (failedChannels.length > 0) {
                    summary += `\n❌ Failed to collect from ${failedChannels.length} channels: ${failedChannels.map(f => f.channel).join(', ')}`
                }

                await progressTracker.finish(summary)
            } finally {
                isCollectingAll = false
            }
            return
        } else if (subcommand === 'collect') {
            const userOrId = await resolveUserOrId()
            const user = userOrId && 'tag' in userOrId ? userOrId : undefined
            const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
            const collectEntireChannel = ctx.getBooleanOption('entire_channel', false)
            const forceRescan = ctx.getBooleanOption('force_rescan', false)
            const limit = collectEntireChannel ? 'entire' : ctx.getIntegerOption('limit')

            const channel = (await ctx.getChannelOption('channel')) as TextChannel

            if (!channel) {
                await ctx.reply('❌ You must specify a channel.')
                return
            }

            const replyContent = `🔍 Starting to collect ${collectEntireChannel ? 'all available' : limit} messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}...`

            await ctx.reply(replyContent)

            let operationTaskId: string | null = null

            try {
                logger.info(`Collecting messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : userId ? ` by user ID ${userId}` : ''}, limit: ${yellow(limit)}`)

                // Setup progress updates
                let totalMessageCount: number | null = null
                let newMessagesOnly = false

                const progressTracker = new ProgressTracker(ctx, `Collecting messages from ${channel}`)

                const progressHandler = async (progress: MarkovCollectProgressEvent) => {
                    if (progress.taskId !== operationTaskId) return

                    const statusText = newMessagesOnly ? 'Only collecting new messages since the last collection.' : undefined

                    if (progress.limit === 'entire') {
                        await progressTracker.update({
                            current: progress.totalCollected,
                            percent: progress.percentComplete,
                            statusText
                        })
                    } else {
                        await progressTracker.update({
                            current: progress.totalCollected,
                            total: progress.limit,
                            statusText
                        })
                    }
                }

                const completionHandler = (result: MarkovCollectCompleteEvent) => {
                    if (result.taskId !== operationTaskId) return
                    totalMessageCount = result.totalMessageCount ?? null
                    newMessagesOnly = result.newMessagesOnly
                    logger.ok(`Collection complete. ${yellow(result.totalCollected)} messages collected${totalMessageCount ? ` out of ${yellow(totalMessageCount)} total` : ''}.`)
                }

                markov.on('collectProgress', progressHandler)
                markov.on('collectComplete', completionHandler)

                // Process in one go
                const { completionPromise, taskId } = markov.collectMessages(channel, {
                    user,
                    userId,
                    limit: limit === null ? undefined : limit,
                    forceRescan: forceRescan ?? undefined
                })
                operationTaskId = taskId
                const count = await completionPromise

                // Clean up event listeners to prevent memory leaks
                markov.removeListener('collectProgress', progressHandler)
                markov.removeListener('collectComplete', completionHandler)

                logger.ok(`Collected ${yellow(count)} messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : userId ? ` by user ID ${userId}` : ''}`)

                // Customize completion message based on whether it was a previously collected channel
                let completionMessage = `✅ Successfully collected ${count} messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}\n`

                if (totalMessageCount && collectEntireChannel) {
                    const percentageCollected = ((count / totalMessageCount) * 100).toFixed(1)
                    completionMessage += `📊 ${count} valid messages out of ${totalMessageCount} total messages in the channel (${percentageCollected}%)\n`
                }

                if (count > 0 && collectEntireChannel) { // Only mark as fully collected if some messages were collected
                    completionMessage += '📋 The entire channel has been marked as fully collected.'
                }

                // Send the final message using our manager
                await progressTracker.finish({
                    content: completionMessage
                })
            } catch (error) {
                // Clean up event listeners in case of error
                markov.removeAllListeners('collectProgress')
                markov.removeAllListeners('collectComplete')

                logger.warn(`Failed to collect messages: ${red(error instanceof Error ? error.message : 'Unknown error')}`)

                try {
                    await ctx.editReply(`❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`)
                } catch (replyError) {
                    // If editReply fails, the token might have expired, so try to send a follow-up
                    logger.warn(`Failed to edit reply with error message: ${red(replyError instanceof Error ? replyError.message : 'Unknown error')}`)
                    try {
                        await ctx.followUp(`❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`)
                    } catch (finalError) {
                        logger.error(`Failed to send any error message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`)
                    }
                }
            }
        }
    }
} satisfies SlashCommand
