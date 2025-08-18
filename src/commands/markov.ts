import { Logger, red, yellow } from '../util/logger'
const logger = new Logger('/markov')

import { ChannelType, SlashCommandBuilder, TextChannel, EmbedBuilder, Message, type MessageEditOptions, InteractionContextType } from 'discord.js'

import { formatTimeRemaining } from '../util/functions'
import { SlashCommand } from '../types'
import { MarkovChat } from '../modules/MarkovChain/MarkovChat'

import type { CommandContext } from '../modules/CommandManager/CommandContext'

// To prevent multiple concurrent collections
let isCollectingAll = false

// Discord interaction tokens expire after 15 minutes
const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes in milliseconds
const SAFETY_MARGIN_MS = 1 * 60 * 1000 // Switch to new message 1 minute before expiry (at 14 minutes)

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

// Helper interface to manage message updates
interface MessageUpdater {
    updateMessage(content: string): Promise<void>
}

// Class to handle message updating with fallback support
class InteractionMessageManager implements MessageUpdater {
    private context: CommandContext
    private followUpMessagePromise: Promise<Message | null> | null = null
    private followUpMessage: Message | null = null
    private useFollowUp = false

    constructor(context: CommandContext) {
        this.context = context
    }

    // Switch to using follow-up message
    public switchToFollowUp(): void {
        if (this.useFollowUp) return
        this.useFollowUp = true
        this.followUpMessagePromise = this.createFollowUpMessage()
    }

    private async createFollowUpMessage(): Promise<Message | null> {
        try {
            // First update the original message to inform users
            await this.context.editReply(
                '⏳ Operation in progress...\n' +
                '⚠️ *This is taking longer than 14 minutes. Real-time updates will continue in a follow-up message.*'
            ).catch((err: Error) => {
                logger.warn(`Failed to update original message about timeout: ${red(err.message)}`)
            })

            // Create a follow-up message that we'll update from now on
            const followUp = await this.context.followUp('🔄 Continuing operation...\nUpdates will now appear in this message.')

            // If followUp returns void (text command), just return null
            if (!followUp || typeof followUp !== 'object' || !('edit' in followUp)) {
                logger.warn('Follow-up message could not be created (likely a text command).')
                return null
            }

            this.followUpMessage = followUp as Message
            logger.ok(`Created follow-up message with ID ${yellow((followUp as Message).id)}`)
            return followUp as Message
        } catch (error) {
            logger.warn(`Failed to create follow-up message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            return null
        }
    }

    public async updateMessage(content: string): Promise<void> {
        try {
            if (this.useFollowUp) {
                // Make sure we have a follow-up message
                if (this.followUpMessagePromise && !this.followUpMessage) {
                    this.followUpMessage = await this.followUpMessagePromise
                }

                if (this.followUpMessage) {
                    await this.followUpMessage.edit(content)
                } else {
                    // Fallback if follow-up message creation failed (e.g., text command)
                    await this.context.editReply(content).catch(() => {})
                }
            } else {
                await this.context.editReply(content)
            }
        } catch (error) {
            logger.warn(`Failed to update message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
        }
    }

    public get isUsingFollowUp(): boolean {
        return this.useFollowUp
    }

    public async sendFinalMessage(options: MessageEditOptions): Promise<void> {
        try {
            if (this.useFollowUp) {
                // Ensure we have the follow-up message before trying to edit it
                if (this.followUpMessagePromise && !this.followUpMessage) {
                    this.followUpMessage = await this.followUpMessagePromise
                }

                if (this.followUpMessage) {
                    await this.followUpMessage.edit(options)
                } else {
                    // This case means we intended to use a follow-up, but it failed to create.
                    // The original interaction is likely expired, so we throw to trigger the catch block's follow-up.
                    throw new Error('Follow-up message not available for final update.')
                }
            } else {
                await this.context.editReply(options)
            }
        } catch (error) {
            // If both methods fail, try to send a new follow-up message with the results
            logger.debug(`Failed to send final message, attempting follow-up final message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            try {
                await this.context.followUp({
                    content: options.content ?? undefined,
                    embeds: options.embeds,
                    allowedMentions: options.allowedMentions
                })
            } catch (finalError) {
                logger.warn(`Failed to send any completion message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`)
            }
        }
    }
}

async function handleLongRunningTask<T, P extends { step?: string, estimatedTimeRemaining?: number | null }>(context: CommandContext, markov: MarkovChat, taskPromise: Promise<T>, progressEventName: 'generateProgress' | 'infoProgress', options: { initialMessage: string, formatProgress: (progress: P) => string }): Promise<T> {
    const messageManager = new InteractionMessageManager(context)
    const interactionStartTime = process.hrtime()
    let lastUpdateTime = 0
    const UPDATE_INTERVAL = 5000 // 5 seconds

    const progressListener = async (progress: P) => {
        const now = process.hrtime(interactionStartTime)
        const elapsedMs = now[0] * 1000 + now[1] / 1e6

        if (elapsedMs < lastUpdateTime + UPDATE_INTERVAL) return
        lastUpdateTime = elapsedMs

        if (elapsedMs > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
            logger.info(`Approaching interaction timeout (${yellow(elapsedMs)}ms elapsed). Switching to follow-up message.`)
            messageManager.switchToFollowUp()
        }

        let progressMessage = `${options.initialMessage}\n`
        if (progress.step) {
            progressMessage += `📊 Step: ${progress.step}\n`
        }
        progressMessage += options.formatProgress(progress)

        if (progress.estimatedTimeRemaining !== null && progress.estimatedTimeRemaining !== undefined) {
            const etaString = formatTimeRemaining(progress.estimatedTimeRemaining)
            progressMessage += `\n⏱️ ETA: ${etaString}`
        }

        await messageManager.updateMessage(progressMessage)
    }

    markov.on(progressEventName, progressListener as (event: any) => void)

    try {
        return await taskPromise
    } finally {
        markov.removeListener(progressEventName, progressListener as (event: any) => void)
    }
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
                .setDescription('Consider all messages from all servers (default: false - just this server)')
                .setRequired(false)
            ).addChannelOption(option => option
                .setName('channel')
                .setDescription('Specific channel to use for message generation (ignored if global is true)')
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
                .setDescription('Specific channel to view statistics for (ignored if global is true)')
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
            .setDescription('Gather messages to train the Markov chain')
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel to collect messages from')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(option => option
                .setName('user')
                .setDescription('Only collect messages from this user')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
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
            .setName('help')
            .setDescription('Detailed information about the command.')
        ).setContexts(InteractionContextType.Guild),
    async execute(context: CommandContext<true>) {

        const subcommand = context.getSubcommand()
        const markov = MarkovChat.getInstance()

        // Helper to resolve user from picker or user_id
        async function resolveUserOrId() {
            const user = await context.getUserOption('user', false, undefined)
            const userId = context.getStringOption('user_id', false, undefined)
            if (user) return user
            if (userId) {
                try {
                    // Try to fetch user from Discord (may fail if user is not cached)
                    return await context.client.users.fetch(userId)
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
            const global = context.getBooleanOption('global', false, false)
            const channel = global ? undefined : (await context.getChannelOption('channel')) as TextChannel | null ?? undefined
            const words = context.getIntegerOption('words', false, 30)
            const seed = context.getStringOption('seed', false) ?? undefined
            const mode = context.getStringOption('mode', false, 'trigram') as 'trigram' | 'bigram'

            await context.deferReply()

            try {
                logger.info(`Generating message with global: ${yellow(global)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}, words: ${yellow(words)}, seed: ${yellow(seed)}`)
                const timeStart = process.hrtime()

                const taskPromise = markov.generateMessage({
                    guild: !global ? context.guild : undefined,
                    channel, user, userId, words, seed, global, mode
                })

                const result = await handleLongRunningTask(context, markov, taskPromise, 'generateProgress', {
                    initialMessage: '⏳ Generating message...',
                    formatProgress: (progress: any) => {
                        if (progress.step === 'training') {
                            const percent = ((progress.progress / progress.total) * 100).toFixed(1)
                            return `🔄 Training: ${progress.progress}/${progress.total} messages (${percent}%)`
                        }
                        return ''
                    }
                })

                const timeEnd = process.hrtime(timeStart)
                const timeEndMs = timeEnd[0] * 1000 + timeEnd[1] / 1e6
                logger.ok(`Generated message: ${yellow(result)}`)

                const footerEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .addFields(
                        { name: 'Generation Time', value: `${timeEndMs.toFixed(0)}ms`, inline: true },
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

                await new InteractionMessageManager(context).sendFinalMessage({
                    content: result,
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

                await context.editReply({ content: userFriendlyError })
            }

        } else if (subcommand === 'stats') {
            const userOrId = await resolveUserOrId()
            const user = userOrId && 'tag' in userOrId ? userOrId : undefined
            const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
            const global = context.getBooleanOption('global', false, false)
            const channel = global ? undefined : (await context.getChannelOption('channel')) as TextChannel | null ?? undefined

            await context.deferReply()

            try {
                logger.info(`Getting Markov info with global: ${yellow(global)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}`)
                const timeStart = process.hrtime()

                const taskPromise = markov.getMessageStats({
                    guild: !global ? context.guild : undefined,
                    channel: channel ?? undefined,
                    user: user,
                    userId: userId,
                    global: global
                })

                const stats = await handleLongRunningTask(context, markov, taskPromise, 'infoProgress', {
                    initialMessage: '⏳ Gathering statistics...',
                    formatProgress: (progress: any) => {
                        if (progress.step === 'processing') {
                            const percent = ((progress.progress / progress.total) * 100).toFixed(1)
                            return `🔄 Processing: ${progress.progress}/${progress.total} messages (${percent}%)`
                        }
                        return ''
                    }
                })

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
                    { name: 'Words Per Message', value: stats.avgWordsPerMessage.toFixed(1), inline: true },
                    { name: 'Oldest Message', value: oldestDate, inline: false },
                    { name: 'Newest Message', value: newestDate, inline: false }
                )

                const embed = new EmbedBuilder()
                    .setTitle('Markov Chain Data Statistics')
                    .setColor(0x0099FF)
                    .addFields(embedFields)
                    .setFooter({ text: `Generated in ${timeEndMs.toFixed(0)}ms` })
                    .setTimestamp()
                    .setDescription(`**Filters Applied:**\n${[global ? '🌐 Global' : channel ? `📝 Channel: #${channel.name}` : '🏠 This server', user ? `👤 User: @${user.tag}` : userId ? `👤 User ID: ${userId}` : null].filter(Boolean).join('\n')}`)

                logger.ok(`Generated Markov info in ${yellow(timeEndMs.toFixed(0))}ms`)
                await new InteractionMessageManager(context).sendFinalMessage({ content: '', embeds: [embed] })
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                logger.warn(`Failed to get Markov info: ${red(errorMessage)}`)
                let userFriendlyError = `❌ Failed to get info: ${errorMessage}`
                if (errorMessage.includes('No messages found')) {
                    userFriendlyError = '❌ No messages found for the selected filters. Try collecting some messages first!'
                }
                await context.editReply({ content: userFriendlyError })
            }

        } else if (subcommand === 'help') {

            type ChannelID = string & {}
            type Timestamp = number & {}
            const helpCooldowns = new Map<ChannelID, Timestamp>()
            const COOLDOWN_TIME = 60 * 1000 // 1 minute

            if (helpCooldowns.has(context.channel!.id)) {
                const lastUsed = helpCooldowns.get(context.channel!.id)!
                const remaining = COOLDOWN_TIME - (Date.now() - lastUsed)
                if (remaining > 0) {
                    await context.reply('❌ this command has a wall of text i get it you wanna spam it so chill out bro and try again in a minute 🥀')
                    return
                }
            }

            helpCooldowns.set(context.channel!.id, Date.now())

            const text = (
                '## `/markov` command\n' +
                '- A (text-based) Markov chain is a model that predicts the next word in a sequence based on the words that came before it.\n' +
                '- This bot uses the messages in servers to build a model and generate new sentences that try to mimic the style of the server members.\n' +
                '### 1. Data Collection\n' +
                '- The bot requires messages to generate sentences. More data equals more accurate and coherent generated sentences.\n' +
                '  - `/markov collect`: Collects messages from a *single* specified channel;\n' +
                '  - `/markov collect_all`: Collects messages from *all* channels accessible by the bot.\n' +
                '- **Note**: both commands have extensive options, like only collecting from a certain user, or with a certain message cap (limit). You can view them all in the slash command option suggestions.\n' +
                '### 2. Text Generation\n' +
                '  - `/markov generate`: Generate a new sentence using the Markov chain model.\n' +
                '- To support filters, the messages are stored inside a PostgreSQL database.\n' +
                '- Everytime the generation command is called, messages are fetched from the database following the filters set.\n' +
                '- Two modes of generation are supported:\n' +
                '  1. `bigram`: uses only the last word as the context to determine the next word (less coherent, effective when there are not that many messages to work with);\n' +
                '  2. `trigram` (default): uses the last two words instead (more coherent but only effective when there are many messages to work with, like over 5-10 thousand).\n' +
                '### 3. Statistics\n' +
                '  - `/markov stats`: Display a summary for the messages stored that match the filters (if provided).'
            )
            const followUpText = (
                '### Privacy concerns?\n' +
                '- The bot\'s code is fully open source: <https://github.com/emberglazee/crimson-one> ([my own model implementation in Rust](<https://github.com/emberglazee/crimson-one/blob/rocketman02/crimson_markov/src/lib.rs>), [this command](<https://github.com/emberglazee/crimson-one/blob/rocketman02/src/commands/markov.ts>), and [FFI and database handlers](<https://github.com/emberglazee/crimson-one/tree/rocketman02/src/modules/MarkovChain>)).\n' +
                '- The messages in the database are never manually viewed or manipulated, unless it\'s crucial for debugging an issue with the model.\n' +
                '- To request deleting specific data from the message database please send a Discord DM to `@emberglaze`, or an email to `emberglaze@emberglaze.ru`, with proof of server ownership, staff membership, or own account ownership (if requesting deletion for yourself).\n' +
                '- Data deletion might be implemented as a bot command in the near future.'
            )
            await context.reply(text)
            await context.followUp(followUpText)

        } else if (subcommand === 'collect_all') {
            if (isCollectingAll) {
                await context.reply('❌ A `collect_all` operation is already in progress. Please wait for it to complete.')
                return
            }

            isCollectingAll = true
            try {
                const userOrId = await resolveUserOrId()
                const user = userOrId && 'tag' in userOrId ? userOrId : undefined
                const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
                const collectEntireChannel = context.getBooleanOption('entire_channel', false)
                const forceRescan = context.getBooleanOption('force_rescan', false, false)
                const limit = collectEntireChannel ? 'entire' : context.getIntegerOption('limit')

                await context.deferReply()
                logger.info('{collect_all} Starting collection from all channels...')

                const textChannels = (await context.guild.channels.fetch()).filter(c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.viewable) as Map<string, TextChannel>
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

                await context.editReply(`📡 Starting collection from **${allTargets.length} channels and threads**...`)

                const collectionPromises = allTargets.map(targetChannel => (async () => {
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
                        return { channel: targetChannel.name, count, status: 'success' }
                    } catch (err) {
                        logger.warn(`Failed to collect from #${yellow(targetChannel.name)}: ${red(err instanceof Error ? err.message : String(err))}`)
                        return { channel: targetChannel.name, count: 0, status: 'error', error: err instanceof Error ? err.message : String(err) }
                    }
                })())

                const results = await Promise.all(collectionPromises)
                const totalCollected = results.reduce((sum, r) => sum + r.count, 0)
                const successfulChannels = results.filter(r => r.status === 'success').length
                const failedChannels = results.filter(r => r.status === 'error')

                let summary = `✅ Finished collecting from all channels and threads. Total messages collected: ${totalCollected}.`
                summary += `\nSuccessfully collected from ${successfulChannels}/${allTargets.length} channels.`
                if (failedChannels.length > 0) {
                    summary += `\n❌ Failed to collect from ${failedChannels.length} channels: ${failedChannels.map(f => f.channel).join(', ')}`
                }

                await context.followUp(summary)
            } finally {
                isCollectingAll = false
            }
            return
        } else if (subcommand === 'collect') {
            const userOrId = await resolveUserOrId()
            const user = userOrId && 'tag' in userOrId ? userOrId : undefined
            const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
            const collectEntireChannel = context.getBooleanOption('entire_channel', false)
            const forceRescan = context.getBooleanOption('force_rescan', false)
            const limit = collectEntireChannel ? 'entire' : context.getIntegerOption('limit')

            const channel = (await context.getChannelOption('channel')) as TextChannel

            if (!channel) {
                await context.reply('❌ You must specify a channel.')
                return
            }

            const replyContent = `🔍 Starting to collect ${collectEntireChannel ? 'all available' : limit} messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}...`

            await context.reply(replyContent)

            let operationTaskId: string | null = null

            try {
                logger.info(`Collecting messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : userId ? ` by user ID ${userId}` : ''}, limit: ${yellow(limit)}`)

                // Setup progress updates
                let totalMessageCount: number | null = null
                let newMessagesOnly = false
                let percentCompleteEmoji = '⏳'

                // Track the interaction start time to handle token expiration
                const interactionStartTime = process.hrtime()

                // Create the message manager for handling follow-up messages
                const messageManager = new InteractionMessageManager(context)

                const progressHandler = async (progress: MarkovCollectProgressEvent) => {
                    if (progress.taskId !== operationTaskId) return

                    // Update every 10 batches
                    if (progress.batchNumber % 10 === 0 || progress.batchNumber === 1) {
                        logger.ok(`[#${progress.channelName}] Progress update: ${yellow(progress.batchNumber)} batches, ${yellow(progress.totalCollected)}/${yellow(progress.limit === 'entire' ? 'ALL' : progress.limit)} messages (${yellow(progress.limit === 'entire' ? '...' : progress.percentComplete.toFixed(1) + '%' )})`)

                        // Check if we're approaching the interaction token timeout
                        const elapsedSinceInteractionArr = process.hrtime(interactionStartTime)
                        const elapsedSinceInteraction = elapsedSinceInteractionArr[0] * 1000 + elapsedSinceInteractionArr[1] / 1e6

                        // If we're reaching the timeout limit and haven't switched to follow-up message yet
                        if (elapsedSinceInteraction > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
                            logger.info(`Approaching interaction timeout (${yellow(elapsedSinceInteraction)}ms elapsed). Switching to follow-up message.`)
                            messageManager.switchToFollowUp()
                        }

                        // Update emoji based on progress percentage
                        if (progress.percentComplete > 0) {
                            if (progress.percentComplete < 25) percentCompleteEmoji = '🟢'
                            else if (progress.percentComplete < 50) percentCompleteEmoji = '🟡'
                            else if (progress.percentComplete < 75) percentCompleteEmoji = '🟠'
                            else percentCompleteEmoji = '🔴'
                        }

                        let progressMessage = `⏳ Collecting messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}...\n`

                        // Show different progress info depending on whether we have total count
                        if (progress.limit === 'entire' && progress.percentComplete > 0) {
                            progressMessage += `${percentCompleteEmoji} Progress: ${progress.totalCollected} messages collected (${progress.percentComplete.toFixed(1)}% complete)\n`
                        } else if (progress.limit === 'entire') {
                            progressMessage += `${percentCompleteEmoji} Progress: ${progress.totalCollected} messages collected\n`
                        } else {
                            progressMessage += `${percentCompleteEmoji} Progress: ${progress.totalCollected}/${progress.limit} messages (${progress.percentComplete.toFixed(1)}%)\n`
                        }

                        // Add ETA information
                        if (progress.estimatedTimeRemaining !== null) {
                            const etaString = formatTimeRemaining(progress.estimatedTimeRemaining)
                            const speed = progress.messagesPerSecond.toFixed(1)

                            progressMessage += `⏱️ ETA: ${etaString} (${speed} msgs/sec)\n`
                        }

                        progressMessage += `📚 Batches processed: ${progress.batchNumber}`

                        if (newMessagesOnly) {
                            progressMessage += '\n⚠️ Only collecting new messages since last collection.'
                        }

                        // Update the appropriate message using our manager
                        await messageManager.updateMessage(progressMessage)
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
                await messageManager.sendFinalMessage({
                    content: completionMessage
                })
            } catch (error) {
                // Clean up event listeners in case of error
                markov.removeAllListeners('collectProgress')
                markov.removeAllListeners('collectComplete')

                logger.warn(`Failed to collect messages: ${red(error instanceof Error ? error.message : 'Unknown error')}`)

                try {
                    await context.editReply(`❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`)
                } catch (replyError) {
                    // If editReply fails, the token might have expired, so try to send a follow-up
                    logger.warn(`Failed to edit reply with error message: ${red(replyError instanceof Error ? replyError.message : 'Unknown error')}`)
                    try {
                        await context.followUp(`❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`)
                    } catch (finalError) {
                        logger.error(`Failed to send any error message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`)
                    }
                }
            }
        }
    }
} satisfies SlashCommand
