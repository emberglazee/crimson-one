import { Logger, red, yellow } from '../util/logger'
const logger = new Logger('/markov')

import { ChannelType, SlashCommandBuilder, TextChannel, EmbedBuilder, Message, type MessageEditOptions } from 'discord.js'

import { formatTimeRemaining } from '../util/functions'
import { SlashCommand } from '../types'
import { MarkovChat } from '../modules/MarkovChain/MarkovChat'

import type { CommandContext } from '../modules/CommandManager/CommandContext'

// To prevent multiple concurrent collections
let isCollectingAll = false

// Discord interaction tokens expire after 15 minutes
const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes in milliseconds
const SAFETY_MARGIN_MS = 1 * 60 * 1000 // Switch to new message 1 minute before expiry (at 14 minutes)

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
                `⏳ Operation in progress...\n` +
                `⚠️ *This is taking longer than 14 minutes. Real-time updates will continue in a follow-up message.*`
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
            if (this.useFollowUp && this.followUpMessage) {
                await this.followUpMessage.edit(options)
            } else {
                await this.context.editReply(options)
            }
        } catch (error) {
            // If both methods fail, try to send a new follow-up message with the results
            logger.warn(`Failed to send final message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            try {
                await this.context.followUp({
                    content: options.content ?? undefined,
                    embeds: options.embeds,
                    allowedMentions: options.allowedMentions
                })
            } catch (finalError) {
                logger.error(`Failed to send any completion message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`)
            }
        }
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('markov')
        .setDescription('Generate text using Markov chains trained on chat messages')
        .addSubcommand(sc => sc
            .setName('generate')
            .setDescription('Create a new message based on collected chat data')
            .addStringOption(so => so
                .setName('source')
                .setDescription('Where to get messages from for generation')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 This entire server', value: 'guild' },
                    { name: '🌐 Global (all servers)', value: 'global' }
                )
            ).addChannelOption(co => co
                .setName('channel')
                .setDescription('Specific channel to use for message generation')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('Generate text in the style of a specific user')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(io => io
                .setName('words')
                .setDescription('How many words to generate (default: 20)')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('seed')
                .setDescription('Start the generated text with specific words')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('mode')
                .setDescription('The generation mode to use (default: trigram)')
                .setRequired(false)
                .addChoices(
                    { name: 'Trigram (default)', value: 'trigram' },
                    { name: 'Bigram (classic)', value: 'bigram' }
                )
            )
        ).addSubcommand(sc => sc
            .setName('info')
            .setDescription('View statistics about available message data')
            .addStringOption(so => so
                .setName('source')
                .setDescription('Where to get message statistics from')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 This entire server', value: 'guild' },
                    { name: '🌐 Global (all servers)', value: 'global' }
                )
            ).addChannelOption(co => co
                .setName('channel')
                .setDescription('Specific channel to view statistics for')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('View statistics for a specific user\'s messages')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('collect')
            .setDescription('Gather messages to train the Markov chain')
            .addChannelOption(co => co
                .setName('channel')
                .setDescription('Channel to collect messages from')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('Only collect messages from this user')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(io => io
                .setName('limit')
                .setDescription('Maximum number of messages to collect (default: 1000)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('entire_channel')
                .setDescription('Collect every message from the channel (ignores limit)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('force_rescan')
                .setDescription('Force a full rescan, ignoring previously collected messages.')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('collect_all')
            .setDescription('Collect messages from every text channel and thread in the server')
            .addUserOption(uo => uo
                .setName('user')
                .setDescription('Only collect messages from this user')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(io => io
                .setName('limit')
                .setDescription('Maximum number of messages to collect per channel (default: 1000)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('entire_channel')
                .setDescription('Collect every message from every channel (ignores limit)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('force_rescan')
                .setDescription('Force a full rescan, ignoring previously collected messages.')
                .setRequired(false)
            )
        ),
    async execute(context) {

        if (!context.guild) {
            logger.info('Command used outside of a server')
            await context.reply('❌ This command can only be used in a server')
            return
        }

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
            const source = (context.getStringOption('source')) as Source
            const channel = source === null ? (await context.getChannelOption('channel')) as TextChannel | null ?? undefined : undefined
            const words = context.getIntegerOption('words', false, 20)
            const seed = context.getStringOption('seed', false)
            const mode = context.getStringOption('mode', false, 'trigram') as 'trigram' | 'bigram'

            await context.deferReply()

            try {
                logger.info(`Generating message with source: ${yellow(source)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}, words: ${yellow(words)}, seed: ${yellow(seed)}`)
                const timeStart = process.hrtime()

                // Create message manager for handling progress updates
                const messageManager = new InteractionMessageManager(context)

                // Track the interaction start time to handle token expiration
                const interactionStartTime = process.hrtime()
                let lastUpdateTime = 0
                let lastStep = ''
                const UPDATE_INTERVAL = 5000 // 5 seconds

                // Listen for progress updates
                markov.on('generateProgress', async progress => {
                    const now = process.hrtime(interactionStartTime)
                    const nowMs = now[0] * 1000 + now[1] / 1e6
                    const stepChanged = progress.step !== lastStep
                    if (!stepChanged && nowMs - lastUpdateTime < UPDATE_INTERVAL) return

                    lastUpdateTime = nowMs
                    lastStep = progress.step

                    // Check if we're approaching the interaction token timeout
                    const elapsedSinceInteraction = nowMs

                    // If we're reaching the timeout limit and haven't switched to follow-up message yet
                    if (elapsedSinceInteraction > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
                        logger.info(`Approaching interaction timeout (${yellow(elapsedSinceInteraction)}ms elapsed). Switching to follow-up message.`)
                        messageManager.switchToFollowUp()
                    }

                    let progressMessage = `⏳ Generating message...\n`
                    progressMessage += `📊 Step: ${progress.step}\n`

                    if (progress.step === 'training') {
                        const percent = ((progress.progress / progress.total) * 100).toFixed(1)
                        progressMessage += `🔄 Training: ${progress.progress}/${progress.total} messages (${percent}%)\n`
                    }

                    if (progress.estimatedTimeRemaining !== null) {
                        const etaString = formatTimeRemaining(progress.estimatedTimeRemaining)
                        progressMessage += `⏱️ ETA: ${etaString}`
                    }

                    await messageManager.updateMessage(progressMessage)
                })

                const result = await markov.generateMessage({
                    guild: source === 'guild' ? context.guild : undefined,
                    channel: channel,
                    user: user,
                    userId: userId,
                    words,
                    seed: seed ?? undefined,
                    global: source === 'global',
                    mode: mode
                })

                // Clean up event listener
                markov.removeAllListeners('generateProgress')

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
                                source === 'global' ? 'Global' : 'This server',
                                channel ? `Channel: #${channel.name ?? channel.id}` : null,
                                user ? `User: @${user.tag}` : userId ? `User ID: ${userId}` : null,
                                words !== 20 ? `Words: ${words}` : null,
                                seed ? `Seed: "${seed}"` : null,
                                `Mode: ${mode}`
                            ].filter(Boolean).join(', ') || 'None',
                            inline: false
                        }
                    )
                    .setTimestamp()

                await messageManager.sendFinalMessage({
                    content: result,
                    embeds: [footerEmbed],
                    allowedMentions: {
                        parse: []
                    }
                })
            } catch (error) {
                // Clean up event listener in case of error
                markov.removeAllListeners('generateProgress')

                logger.warn(`Failed to generate message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
                await context.editReply({
                    content: `❌ Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }

        } else if (subcommand === 'info') {
            const userOrId = await resolveUserOrId()
            const user = userOrId && 'tag' in userOrId ? userOrId : undefined
            const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined
            const source = (context.getStringOption('source')) as Source
            const channel = source === null ? (await context.getChannelOption('channel')) as TextChannel | null ?? undefined : undefined

            await context.deferReply()

            try {
                logger.info(`Getting Markov info with source: ${yellow(source)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}`)
                const timeStart = process.hrtime()

                // Create message manager for handling progress updates
                const messageManager = new InteractionMessageManager(context)

                // Track the interaction start time to handle token expiration
                const interactionStartTime = process.hrtime()
                let lastUpdateTime = 0
                let lastStep = ''
                const UPDATE_INTERVAL = 5000 // 5 seconds

                // Listen for progress updates
                markov.on('infoProgress', async progress => {
                    const now = process.hrtime(interactionStartTime)
                    const nowMs = now[0] * 1000 + now[1] / 1e6
                    const stepChanged = progress.step !== lastStep
                    if (!stepChanged && nowMs - lastUpdateTime < UPDATE_INTERVAL) return

                    lastUpdateTime = nowMs
                    lastStep = progress.step

                    // Check if we're approaching the interaction token timeout
                    const elapsedSinceInteraction = nowMs

                    // If we're reaching the timeout limit and haven't switched to follow-up message yet
                    if (elapsedSinceInteraction > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
                        logger.info(`Approaching interaction timeout (${yellow(elapsedSinceInteraction)}ms elapsed). Switching to follow-up message.`)
                        messageManager.switchToFollowUp()
                    }

                    let progressMessage = `⏳ Gathering statistics...\n`
                    progressMessage += `📊 Step: ${progress.step}\n`

                    if (progress.step === 'processing') {
                        const percent = ((progress.progress / progress.total) * 100).toFixed(1)
                        progressMessage += `🔄 Processing: ${progress.progress}/${progress.total} messages (${percent}%)\n`
                    }

                    if (progress.estimatedTimeRemaining !== null) {
                        const etaString = formatTimeRemaining(progress.estimatedTimeRemaining)
                        progressMessage += `⏱️ ETA: ${etaString}`
                    }

                    await messageManager.updateMessage(progressMessage)
                })

                const stats = await markov.getMessageStats({
                    guild: source === 'guild' ? context.guild : undefined,
                    channel: !source ? channel : undefined,
                    user: user,
                    userId: userId,
                    global: source === 'global'
                })

                // Clean up event listener
                markov.removeAllListeners('infoProgress')

                const timeEnd = process.hrtime(timeStart)
                const timeEndMs = timeEnd[0] * 1000 + timeEnd[1] / 1e6

                // Format timestamps to readable dates
                const oldestDate = stats.oldestMessageTimestamp
                    ? new Date(stats.oldestMessageTimestamp).toLocaleString('en-GB')
                    : 'N/A'
                const newestDate = stats.newestMessageTimestamp
                    ? new Date(stats.newestMessageTimestamp).toLocaleString('en-GB')
                    : 'N/A'

                const embed = new EmbedBuilder()
                    .setTitle('Markov Chain Data Statistics')
                    .setColor(0x0099FF)
                    .addFields(
                        { name: 'Messages', value: stats.messageCount.toLocaleString(), inline: true },
                        { name: 'Unique Authors', value: stats.authorCount.toLocaleString(), inline: true },
                        { name: 'Channels', value: stats.channelCount.toLocaleString(), inline: true },
                        { name: 'Total Words', value: stats.totalWordCount.toLocaleString(), inline: true },
                        { name: 'Unique Words', value: stats.uniqueWordCount.toLocaleString(), inline: true },
                        { name: 'Words Per Message', value: stats.avgWordsPerMessage.toFixed(1), inline: true },
                        { name: 'Oldest Message', value: oldestDate, inline: false },
                        { name: 'Newest Message', value: newestDate, inline: false },
                    )
                    .setFooter({ text: `Generated in ${timeEndMs.toFixed(0)}ms` })
                    .setTimestamp()

                // Add description with filter info
                embed.setDescription(
                    `**Filters Applied:**\n${[
                        source === 'global' ? '🌐 Global' : !source && channel ? `📝 Channel: #${channel.name}` : '🏠 This server',
                        user ? `👤 User: @${user.tag}` : userId ? `👤 User ID: ${userId}` : null
                    ].filter(Boolean).join('\n')}`
                )

                logger.ok(`Generated Markov info in ${yellow(timeEndMs.toFixed(0))}ms`)
                await messageManager.sendFinalMessage({
                    content: '',
                    embeds: [embed]
                })
            } catch (error) {
                // Clean up event listener in case of error
                markov.removeAllListeners('infoProgress')

                logger.warn(`Failed to get Markov info: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
                await context.editReply({
                    content: `❌ Failed to get Markov info: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }

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
                const forceRescan = context.getBooleanOption('force_rescan', false)
                const limit = collectEntireChannel ? 'entire' : context.getIntegerOption('limit')

                await context.deferReply()
                logger.info(`{collect_all} Starting collection from all channels...`)

                const textChannels = (await context.guild.channels.fetch())
                    .filter(c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.viewable) as Map<string, TextChannel>
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
                        const count = await markov.collectMessages(targetChannel as TextChannel, {
                            user,
                            userId,
                            limit: limit === null ? undefined : limit,
                            disableUserApiLookup: true,
                            forceRescan: forceRescan ?? undefined
                        })
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

                let summary = `✅ Finished collecting from all channels and threads. Total messages collected: ${totalCollected}.
`
                summary += `Successfully collected from ${successfulChannels}/${allTargets.length} channels.`
                if (failedChannels.length > 0) {
                    summary += `
❌ Failed to collect from ${failedChannels.length} channels: ${failedChannels.map(f => f.channel).join(', ')}`
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

            let replyContent = `🔍 Starting to collect ${collectEntireChannel ? 'ALL' : limit} messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}...`
            if (collectEntireChannel) {
                replyContent += `\n💡 Using Discord User API to fetch the total message count.`
            }

            await context.reply(replyContent)

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

                markov.on('collectProgress', async progress => {
                    // Update every 10 batches
                    if (progress.batchNumber % 10 === 0 || progress.batchNumber === 1) {
                        logger.ok(`Progress update: ${yellow(progress.batchNumber)} batches, ${yellow(progress.totalCollected)}/${yellow(progress.limit === 'entire' ? 'ALL' : progress.limit)} messages (${yellow(progress.limit === 'entire' ? '...' : progress.percentComplete.toFixed(1) + '%' )})`)

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
                            progressMessage += `\n⚠️ Only collecting new messages since last collection.`
                        }

                        // Update the appropriate message using our manager
                        await messageManager.updateMessage(progressMessage)
                    }
                })

                // Listen for collection completion to get total message count
                markov.on('collectComplete', result => {
                    totalMessageCount = result.totalMessageCount ?? null
                    newMessagesOnly = result.newMessagesOnly
                    logger.ok(`Collection complete. ${yellow(result.totalCollected)} messages collected${totalMessageCount ? ` out of ${yellow(totalMessageCount)} total` : ''}.`)
                })

                // Process in one go
                const count = await markov.collectMessages(channel, {
                    user,
                    userId,
                    limit: limit === null ? undefined : limit,
                    forceRescan: forceRescan ?? undefined
                })

                // Clean up event listeners to prevent memory leaks
                markov.removeAllListeners('collectProgress')
                markov.removeAllListeners('collectComplete')

                logger.ok(`Collected ${yellow(count)} messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : userId ? ` by user ID ${userId}` : ''}`)

                // Customize completion message based on whether it was a previously collected channel
                let completionMessage = `✅ Successfully collected ${count} messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}\n`

                if (totalMessageCount && collectEntireChannel) {
                    const percentageCollected = ((count / totalMessageCount) * 100).toFixed(1)
                    completionMessage += `📊 ${count} valid messages out of ${totalMessageCount} total messages in the channel (${percentageCollected}%)\n`
                }

                if (count > 0 && collectEntireChannel) { // Only mark as fully collected if some messages were collected
                    completionMessage += `📋 The entire channel has been marked as fully collected.`
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

type Source = 'guild' | 'global' | null
