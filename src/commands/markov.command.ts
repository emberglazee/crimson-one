import { Logger, red, yellow } from '../util/logger'
const logger = new Logger('/markov')

import { ChannelType, SlashCommandBuilder, MessageFlags, TextChannel, EmbedBuilder, Message, ChatInputCommandInteraction } from 'discord.js'

import { formatTimeRemaining } from '../util/functions'
import { SlashCommand } from '../types/types'
import { MarkovChat } from '../modules/MarkovChain/MarkovChat'
import { DataSource } from '../modules/MarkovChain/DataSource'

// Discord interaction tokens expire after 15 minutes
const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes in milliseconds
const SAFETY_MARGIN_MS = 1 * 60 * 1000 // Switch to new message 1 minute before expiry (at 14 minutes)

// Helper interface to manage message updates
interface MessageUpdater {
    updateMessage(content: string): Promise<void>
}

// Class to handle message updating with fallback support
class InteractionMessageManager implements MessageUpdater {
    private interaction: ChatInputCommandInteraction
    private followUpMessagePromise: Promise<Message<boolean> | null> | null = null
    private followUpMessage: Message | null = null
    private useFollowUp = false
    private ephemeral: boolean

    constructor(interaction: ChatInputCommandInteraction, ephemeral: boolean) {
        this.interaction = interaction
        this.ephemeral = ephemeral
    }

    // Switch to using follow-up message
    public switchToFollowUp(): void {
        if (this.useFollowUp) return
        this.useFollowUp = true

        this.followUpMessagePromise = this.createFollowUpMessage()
    }

    private async createFollowUpMessage(): Promise<Message<boolean> | null> {
        try {
            // First update the original message to inform users
            await this.interaction.editReply(
                `⏳ Operation in progress...\n` +
                `⚠️ *This is taking longer than 14 minutes. Real-time updates will continue in a follow-up message.*`
            ).catch((err: Error) => {
                logger.warn(`Failed to update original message about timeout: ${red(err.message)}`)
            })

            // Create a follow-up message that we'll update from now on
            const followUp = await this.interaction.followUp({
                content: `🔄 Continuing operation...\nUpdates will now appear in this message.`,
                flags: this.ephemeral ? MessageFlags.Ephemeral : undefined
            })

            this.followUpMessage = followUp
            logger.ok(`Created follow-up message with ID ${yellow(followUp.id)}`)
            return followUp
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
                    // Fallback if follow-up message creation failed
                    await this.interaction.editReply(content).catch(() => {})
                }
            } else {
                await this.interaction.editReply(content)
            }
        } catch (error) {
            logger.warn(`Failed to update message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
        }
    }

    public get isUsingFollowUp(): boolean {
        return this.useFollowUp
    }

    public async sendFinalMessage(options: { content?: string; embeds?: EmbedBuilder[] }): Promise<void> {
        try {
            if (this.useFollowUp && this.followUpMessage) {
                await this.followUpMessage.edit(options)
            } else {
                await this.interaction.editReply(options)
            }
        } catch (error) {
            // If both methods fail, try to send a new follow-up message with the results
            logger.warn(`Failed to send final message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            try {
                await this.interaction.followUp({
                    ...options,
                    flags: this.ephemeral ? MessageFlags.Ephemeral : undefined
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
            ).addIntegerOption(io => io
                .setName('words')
                .setDescription('How many words to generate (default: 20)')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('seed')
                .setDescription('Start the generated text with specific words')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('ephemeral')
                .setDescription('Show the generated text only to you')
                .setRequired(false)
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
            ).addBooleanOption(bo => bo
                .setName('ephemeral')
                .setDescription('Show statistics only to you')
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
            ).addIntegerOption(io => io
                .setName('limit')
                .setDescription('Maximum number of messages to collect (default: 1000)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('entirechannel')
                .setDescription('Collect every message from the channel (ignores limit)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('allchannels')
                .setDescription('Collect messages from every text channel and thread in the server')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('ephemeral')
                .setDescription('Show collection progress only to you')
                .setRequired(false)
            )
        ),
    async execute({ reply, editReply, deferReply, followUp, guild }, interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

        if (!guild) {
            logger.info('Command used outside of a server')
            await reply({
                content: '❌ This command can only be used in a server',
                flags: MessageFlags.Ephemeral
            })
            return
        }

        const subcommand = interaction.options.getSubcommand() as 'generate' | 'info' | 'collect'
        const markov = MarkovChat.getInstance()
        const dataSource = DataSource.getInstance()

        if (subcommand === 'generate') {
            const user = interaction.options.getUser('user') ?? undefined
            const source = (interaction.options.getString('source') as Source)
            const channel = source === null ? (interaction.options.getChannel('channel') as TextChannel | null) ?? undefined : undefined
            const words = interaction.options.getInteger('words') ?? 20
            const seed = interaction.options.getString('seed') ?? undefined

            await deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined })

            try {
                logger.info(`Generating message with source: ${yellow(source)}, user: ${yellow(user?.tag)}, channel: ${yellow(channel?.name)}, words: ${yellow(words)}, seed: ${yellow(seed)}`)
                const timeStart = process.hrtime()

                // Create message manager for handling progress updates
                const messageManager = new InteractionMessageManager(interaction, ephemeral)

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

                    const elapsedTimeString = formatTimeRemaining(progress.elapsedTime / 1000)
                    progressMessage += `⌛ Elapsed: ${elapsedTimeString}\n`

                    if (progress.estimatedTimeRemaining !== null) {
                        const etaString = formatTimeRemaining(progress.estimatedTimeRemaining)
                        progressMessage += `⏱️ ETA: ${etaString}`
                    }

                    await messageManager.updateMessage(progressMessage)
                })

                const result = await markov.generateMessage({
                    guild: source === 'guild' ? guild : undefined,
                    channel: channel,
                    user,
                    words,
                    seed,
                    global: source === 'global'
                })

                // Clean up event listener
                markov.removeAllListeners('generateProgress')

                const timeEnd = process.hrtime(timeStart)
                const timeEndMs = timeEnd[0] * 1000 + timeEnd[1] / 1e6
                logger.ok(`Generated message: ${yellow(result)}`)
                await messageManager.sendFinalMessage({
                    content: `${result}\n` +
                    `-# - Generated in ${timeEndMs.toFixed(0)}ms\n` +
                    `-# - Filters: ${[
                        source === 'global' ? 'Global' : 'This server',
                        user ? `User: @${user.tag}` : null,
                        words !== 20 ? `Words: ${words}` : null,
                        seed ? `Seed: "${seed}"` : null
                    ].filter(Boolean).join(', ') || 'None'}`
                })
            } catch (error) {
                // Clean up event listener in case of error
                markov.removeAllListeners('generateProgress')

                logger.warn(`Failed to generate message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
                await editReply({
                    content: `❌ Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }

        } else if (subcommand === 'info') {
            const user = interaction.options.getUser('user') ?? undefined
            const source = (interaction.options.getString('source') as Source)
            const channel = source === null ? (interaction.options.getChannel('channel') as TextChannel | null) ?? undefined : undefined

            await deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined })

            try {
                logger.info(`Getting Markov info with source: ${yellow(source)}, user: ${yellow(user?.tag)}, channel: ${yellow(channel?.name)}`)
                const timeStart = process.hrtime()

                // Create message manager for handling progress updates
                const messageManager = new InteractionMessageManager(interaction, ephemeral)

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

                    const elapsedTimeString = formatTimeRemaining(progress.elapsedTime / 1000)
                    progressMessage += `⌛ Elapsed: ${elapsedTimeString}\n`

                    if (progress.estimatedTimeRemaining !== null) {
                        const etaString = formatTimeRemaining(progress.estimatedTimeRemaining)
                        progressMessage += `⏱️ ETA: ${etaString}`
                    }

                    await messageManager.updateMessage(progressMessage)
                })

                const stats = await markov.getMessageStats({
                    guild: source === 'guild' ? guild : undefined,
                    channel: !source ? channel : undefined,
                    user,
                    global: source === 'global'
                })

                // Clean up event listener
                markov.removeAllListeners('infoProgress')

                const timeEnd = process.hrtime(timeStart)
                const timeEndMs = timeEnd[0] * 1000 + timeEnd[1] / 1e6

                // Format timestamps to readable dates
                const oldestDate = stats.oldestMessageTimestamp
                    ? new Date(stats.oldestMessageTimestamp).toLocaleString()
                    : 'N/A'
                const newestDate = stats.newestMessageTimestamp
                    ? new Date(stats.newestMessageTimestamp).toLocaleString()
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
                        user ? `👤 User: @${user.tag}` : null
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
                await editReply({
                    content: `❌ Failed to get Markov info: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }

        } else if (subcommand === 'collect') {
            const user = interaction.options.getUser('user') ?? undefined
            const collectEntireChannel = interaction.options.getBoolean('entirechannel') ?? false
            const limit = collectEntireChannel ? 'entire' : (interaction.options.getInteger('limit') ?? 100_000_000)

            const allChannels = interaction.options.getBoolean('allchannels') ?? false
            if (allChannels) {
                await deferReply({
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                logger.info(`{collect} "allChannels" is true, collecting from every channel`)
                const textChannels = (await guild.channels.fetch())
                    .filter(c => c &&
                        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
                        c.viewable
                    ) as Map<string, TextChannel>
                logger.ok(`{collect} Fetched ${yellow(textChannels.size)} text channels`)

                const threadPromises = [...textChannels.values()].map(async c => {
                    try {
                        const threads = await c.threads.fetch()
                        return threads.threads.filter(t => t.viewable)
                    } catch {
                        return []
                    }
                })

                const threads = (await Promise.all(threadPromises)).flatMap(t => [...t.values()])
                logger.ok(`{collect} Fetched ${yellow(threads.length)} threads`)

                const allTargets = [...textChannels.values(), ...threads]
                logger.info(`{collect} ${yellow(textChannels.size)} + ${yellow(threads.length)} = ${yellow(textChannels.size + threads.length)} total collection targets`)

                await editReply(`📡 Starting collection from **${allTargets.length} channels and threads**...`)

                for await (const targetChannel of allTargets) {
                    try {
                        logger.info(`Collecting from #${yellow(targetChannel.name)} (${yellow(targetChannel.id)})`)
                        const count = await markov.collectMessages(targetChannel as TextChannel, {
                            user,
                            limit,
                        })
                        logger.ok(`Collected ${yellow(count)} messages from #${yellow(targetChannel.name)}`)
                    } catch (err) {
                        logger.warn(`Failed to collect from #${yellow(targetChannel.name)}: ${red(err instanceof Error ? err.message : err)}`)
                    }
                }

                await followUp({
                    content: `✅ Finished collecting from all channels and threads.`,
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                return
            }
            const channel = interaction.options.getChannel('channel') as TextChannel

            if (!allChannels && !channel) {
                await reply({
                    content: '❌ You must specify a channel unless `allchannels` is enabled.',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                return
            }

            // Check if channel was previously fully collected
            const wasFullyCollected = await dataSource.isChannelFullyCollected(guild.id, channel.id)

            // Reply with appropriate message
            let replyContent = `🔍 Starting to collect ${collectEntireChannel ? 'ALL' : limit} messages from ${channel}${user ? ` by ${user}` : ''}...`
            if (wasFullyCollected) {
                replyContent += `\n⚠️ This channel was already fully collected before. Only collecting new messages since the last collection.`
            }
            if (collectEntireChannel) {
                replyContent += `\n💡 Using Discord User API to fetch the total message count.`
            }

            await reply({
                content: replyContent,
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })

            try {
                logger.info(`Collecting messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : ''}, limit: ${yellow(limit)}, wasFullyCollected: ${yellow(wasFullyCollected)}`)

                // Setup progress updates
                let totalMessageCount = null
                let percentCompleteEmoji = '⏳'

                // Track the interaction start time to handle token expiration
                const interactionStartTime = process.hrtime()

                // Create the message manager for handling follow-up messages
                const messageManager = new InteractionMessageManager(interaction, ephemeral)

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

                        let progressMessage = `⏳ Collecting messages from ${channel}${user ? ` by ${user}` : ''}...\n`

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

                            // Show elapsed time for context
                            const elapsedTimeString = formatTimeRemaining(progress.elapsedTime / 1000)
                            progressMessage += `⌛ Elapsed: ${elapsedTimeString}\n`
                        }

                        progressMessage += `📚 Batches processed: ${progress.batchNumber}`

                        if (wasFullyCollected) {
                            progressMessage += `\n⚠️ Only collecting new messages since last collection.`
                        }

                        // Update the appropriate message using our manager
                        await messageManager.updateMessage(progressMessage)
                    }
                })

                // Listen for collection completion to get total message count
                markov.on('collectComplete', result => {
                    totalMessageCount = result.totalMessageCount
                    logger.ok(`Collection complete. ${yellow(result.totalCollected)} messages collected${totalMessageCount ? ` out of ${yellow(totalMessageCount)} total` : ''}.`)
                })

                // Process in one go
                const count = await markov.collectMessages(channel, {
                    user,
                    limit,
                })

                // Clean up event listeners to prevent memory leaks
                markov.removeAllListeners('collectProgress')
                markov.removeAllListeners('collectComplete')

                logger.ok(`Collected ${yellow(count)} messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : ''}`)

                // Customize completion message based on whether it was a previously collected channel
                let completionMessage = `✅ Successfully collected ${count} messages from ${channel}${user ? ` by ${user}` : ''}\n`

                if (totalMessageCount && collectEntireChannel) {
                    const percentageCollected = ((count / totalMessageCount) * 100).toFixed(1)
                    completionMessage += `📊 ${count} valid messages out of ${totalMessageCount} total messages in the channel (${percentageCollected}%)\n`
                }

                if (await wasFullyCollected) {
                    completionMessage += `📋 These were new messages since the previous collection.`
                } else if (collectEntireChannel) {
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
                    await editReply({
                        content: `❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`
                    })
                } catch (replyError) {
                    // If editReply fails, the token might have expired, so try to send a follow-up
                    logger.warn(`Failed to edit reply with error message: ${red(replyError instanceof Error ? replyError.message : 'Unknown error')}`)
                    try {
                        await followUp({
                            content: `❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            flags: ephemeral ? MessageFlags.Ephemeral : undefined
                        })
                    } catch (finalError) {
                        logger.error(`Failed to send any error message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`)
                    }
                }
            }
        }
    }
} satisfies SlashCommand

type Source = 'guild' | 'global' | null
