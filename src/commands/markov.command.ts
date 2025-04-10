import { ChannelType, SlashCommandBuilder, MessageFlags, TextChannel, EmbedBuilder, Message, ChatInputCommandInteraction } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { MarkovChat } from '../modules/MarkovChain/MarkovChat'
import { DataSource } from '../modules/MarkovChain/DataSource'
import { Logger } from '../util/logger'
import { inspect } from 'util'

const logger = Logger.new('/markov')

// Discord interaction tokens expire after 15 minutes
const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes in milliseconds
const SAFETY_MARGIN_MS = 1 * 60 * 1000 // Switch to new message 1 minute before expiry (at 14 minutes)

/**
 * Format seconds into a human-readable time string
 */
function formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = Math.round(seconds % 60)
        return `${minutes}m ${remainingSeconds}s`
    } else {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const remainingSeconds = Math.round(seconds % 60)
        return `${hours}h ${minutes}m ${remainingSeconds}s`
    }
}

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
                `⚠️ This operation is taking longer than 14 minutes. ` +
                `Real-time updates will continue in a follow-up message to avoid token expiration.`
            ).catch((err: Error) => {
                logger.warn(`Failed to update original message about timeout: ${err.message}`)
            })

            // Create a follow-up message that we'll update from now on
            const followUp = await this.interaction.followUp({
                content: `🔄 Continuing operation...\nUpdates will now appear in this message.`,
                ephemeral: this.ephemeral
            })

            this.followUpMessage = followUp
            logger.ok(`Created follow-up message with ID ${followUp.id}`)
            return followUp
        } catch (error) {
            logger.warn(`Failed to create follow-up message: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
            logger.warn(`Failed to update message: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    public get isUsingFollowUp(): boolean {
        return this.useFollowUp
    }

    public async sendFinalMessage(content: string): Promise<void> {
        try {
            if (this.useFollowUp && this.followUpMessage) {
                await this.followUpMessage.edit(content)
            } else {
                await this.interaction.editReply(content)
            }
        } catch (error) {
            // If both methods fail, try to send a new follow-up message with the results
            logger.warn(`Failed to send final message: ${error instanceof Error ? error.message : 'Unknown error'}`)
            try {
                await this.interaction.followUp({
                    content: `${content}\n⚠️ (Posted as a new message because the original interaction expired)`,
                    ephemeral: this.ephemeral
                })
            } catch (finalError) {
                logger.error(`Failed to send any completion message: ${finalError instanceof Error ? finalError.message : 'Unknown error'}`)
            }
        }
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('markov')
        .setDescription('Generate messages using Markov chains')
        .addSubcommand(sc => sc
            .setName('generate')
            .setDescription('Generate a message using collected data')
            .addStringOption(so => so
                .setName('source')
                .setDescription('Where to generate messages from')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 This Server', value: 'guild' },
                    { name: '📝 Specific Channel', value: 'channel' },
                    { name: '🌐 Global (All Servers)', value: 'global' }
                )
            ).addChannelOption(co => co
                .setName('channel')
                .setDescription('Channel to generate from (only if source is "Specific Channel")')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('Filter messages to this user')
                .setRequired(false)
            ).addIntegerOption(io => io
                .setName('words')
                .setDescription('Number of words to generate (default: 20)')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('seed')
                .setDescription('Start the chain with these words')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('ephemeral')
                .setDescription('Only show the response to you')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('info')
            .setDescription('Display information about available Markov chain data')
            .addStringOption(so => so
                .setName('source')
                .setDescription('Where to get data from')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 This Server', value: 'guild' },
                    { name: '📝 Specific Channel', value: 'channel' },
                    { name: '🌐 Global (All Servers)', value: 'global' }
                )
            ).addChannelOption(co => co
                .setName('channel')
                .setDescription('Channel to get info from (only if source is "Specific Channel")')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('Filter info to this user')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('ephemeral')
                .setDescription('Only show the response to you')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('collect')
            .setDescription('Collect messages to build Markov chains from')
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
                .setDescription('Collect ALL messages from the channel (overrides limit)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('allchannels')
                .setDescription('Collect messages from ALL accessible text channels (including threads)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('ephemeral')
                .setDescription('Only show the response to you')
                .setRequired(false)
            )
        ),
    async execute(interaction, { reply, editReply, deferReply, followUp }) {
        const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

        if (!interaction.guild) {
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
            const source = interaction.options.getString('source') ?? 'guild'
            const channel = (interaction.options.getChannel('channel') as TextChannel | null) ?? undefined
            const words = interaction.options.getInteger('words') ?? 20
            const seed = interaction.options.getString('seed') ?? undefined

            // Validate channel is provided when source is 'channel'
            if (source === 'channel' && !channel) {
                logger.info('Channel not provided for "Specific Channel" source')
                await reply({
                    content: '❌ You must specify a channel when using "Specific Channel" as the source',
                    flags: MessageFlags.Ephemeral
                })
                return
            }

            // Validate channel is not provided for other sources
            if (source !== 'channel' && channel) {
                logger.info('Channel provided for non-"Specific Channel" source')
                await reply({
                    content: '❌ Channel option should only be used with "Specific Channel" source',
                    flags: MessageFlags.Ephemeral
                })
                return
            }

            await deferReply({ ephemeral })

            try {
                logger.info(`Generating message with source: ${source}, user: ${user?.tag}, channel: ${channel?.name}, words: ${words}, seed: ${seed}`)
                const timeStart = Date.now()
                const result = await markov.generateMessage({
                    guild: source === 'guild' ? interaction.guild : undefined,
                    channel: source === 'channel' ? channel : undefined,
                    user,
                    words,
                    seed,
                    global: source === 'global'
                })
                const timeEnd = Date.now()
                logger.ok(`Generated message: ${result}`)
                await editReply(
                    `${result}\n` +
                    `-# - Generated in ${timeEnd - timeStart}ms\n` +
                    `-# - Filters: ${[
                        source === 'global' ? 'Global' : source === 'channel' ? `Channel: #${channel?.name}` : 'Server-only',
                        user ? `User: @${user.tag}` : null,
                        words !== 20 ? `Words: ${words}` : null,
                        seed ? `Seed: "${seed}"` : null
                    ].filter(Boolean).join(', ') || 'None'}`
                )
            } catch (error) {
                logger.warn(`Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}`)
                await editReply({
                    content: `❌ Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }



        } else if (subcommand === 'info') {
            const user = interaction.options.getUser('user') ?? undefined
            const source = interaction.options.getString('source') ?? 'guild'
            const channel = (interaction.options.getChannel('channel') as TextChannel | null) ?? undefined

            // Validate channel is provided when source is 'channel'
            if (source === 'channel' && !channel) {
                logger.info('Channel not provided for "Specific Channel" source')
                await reply({
                    content: '❌ You must specify a channel when using "Specific Channel" as the source',
                    flags: MessageFlags.Ephemeral
                })
                return
            }

            // Validate channel is not provided for other sources
            if (source !== 'channel' && channel) {
                logger.info('Channel provided for non-"Specific Channel" source')
                await reply({
                    content: '❌ Channel option should only be used with "Specific Channel" source',
                    flags: MessageFlags.Ephemeral
                })
                return
            }

            await deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined })

            try {
                logger.info(`Getting Markov info with source: ${source}, user: ${user?.tag}, channel: ${channel?.name}`)
                const timeStart = Date.now()
                const stats = await markov.getMessageStats({
                    guild: source === 'guild' ? interaction.guild : undefined,
                    channel: source === 'channel' ? channel : undefined,
                    user,
                    global: source === 'global'
                })
                const timeEnd = Date.now()

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
                    .setFooter({ text: `Generated in ${timeEnd - timeStart}ms` })
                    .setTimestamp()

                // Add description with filter info
                embed.setDescription(
                    `**Filters Applied:**\n${[
                        source === 'global' ? '🌐 Global' : source === 'channel' ? `📝 Channel: #${channel?.name}` : '🏠 Server-only',
                        user ? `👤 User: @${user.tag}` : null
                    ].filter(Boolean).join('\n')}`
                )

                logger.ok(`Generated Markov info in ${timeEnd - timeStart}ms`)
                await editReply({ embeds: [embed] })
            } catch (error) {
                logger.warn(`Failed to get Markov info: ${error instanceof Error ? error.message : 'Unknown error'}`)
                await editReply({
                    content: `❌ Failed to get Markov info: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }



        } else if (subcommand === 'collect') {
            logger.info(`{collect} Interaction options: ${inspect(interaction.options.resolved, true, 2, true)}`)
            const user = interaction.options.getUser('user') ?? undefined
            const collectEntireChannel = interaction.options.getBoolean('entirechannel') ?? false
            const limit = collectEntireChannel ? 'entire' : (interaction.options.getInteger('limit') ?? 100_000_000)

            const allChannels = interaction.options.getBoolean('allchannels') ?? false
            if (allChannels) {
                const textChannels = interaction.guild.channels.cache
                    .filter(c =>
                        (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) &&
                        c.viewable
                    ) as Map<string, TextChannel>

                const threadPromises = [...textChannels.values()].map(async c => {
                    try {
                        const threads = await c.threads.fetchActive()
                        return threads.threads.filter(t => t.viewable)
                    } catch {
                        return []
                    }
                })

                const threads = (await Promise.all(threadPromises)).flatMap(t => [...t.values()])

                const allTargets = [...textChannels.values(), ...threads]

                await reply({
                    content: `📡 Starting collection from **${allTargets.length} channels and threads**...`,
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })

                for (const targetChannel of allTargets) {
                    try {
                        logger.info(`Collecting from #${targetChannel.name} (${targetChannel.id})`)
                        const count = await markov.collectMessages(targetChannel as TextChannel, {
                            user,
                            limit,
                        })
                        logger.ok(`Collected ${count} messages from #${targetChannel.name}`)
                    } catch (err) {
                        logger.warn(`Failed to collect from #${targetChannel.name}: ${err instanceof Error ? err.message : err}`)
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
            const wasFullyCollected = await dataSource.isChannelFullyCollected(interaction.guild.id, channel.id)

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
                logger.info(`Collecting messages from ${channel}${user ? ` by ${user.tag}` : ''}, limit: ${limit}, wasFullyCollected: ${wasFullyCollected}`)

                // Setup progress updates
                let totalMessageCount = null
                let percentCompleteEmoji = '⏳'

                // Track the interaction start time to handle token expiration
                const interactionStartTime = Date.now()

                // Create the message manager for handling follow-up messages
                const messageManager = new InteractionMessageManager(interaction, ephemeral)

                markov.on('collectProgress', async progress => {
                    // Update every 10 batches
                    if (progress.batchNumber % 10 === 0 || progress.batchNumber === 1) {
                        logger.ok(`Progress update: ${progress.batchNumber} batches, ${progress.totalCollected}/${progress.limit === 'entire' ? 'ALL' : progress.limit} messages (${progress.limit === 'entire' ? '...' : progress.percentComplete.toFixed(1) + '%'})`)

                        // Check if we're approaching the interaction token timeout
                        const elapsedSinceInteraction = Date.now() - interactionStartTime

                        // If we're reaching the timeout limit and haven't switched to follow-up message yet
                        if (elapsedSinceInteraction > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
                            logger.warn(`Approaching interaction timeout (${elapsedSinceInteraction}ms elapsed). Switching to follow-up message.`)
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
                    logger.ok(`Collection complete. ${result.totalCollected} messages collected${totalMessageCount ? ` out of ${totalMessageCount} total` : ''}.`)
                })

                // Process in one go
                const count = await markov.collectMessages(channel, {
                    user,
                    limit,
                })

                // Clean up event listeners to prevent memory leaks
                markov.removeAllListeners('collectProgress')
                markov.removeAllListeners('collectComplete')

                logger.ok(`Collected ${count} messages from ${channel}${user ? ` by ${user.tag}` : ''}`)

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
                await messageManager.sendFinalMessage(completionMessage)
            } catch (error) {
                // Clean up event listeners in case of error
                markov.removeAllListeners('collectProgress')
                markov.removeAllListeners('collectComplete')

                logger.warn(`Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`)

                try {
                    await editReply({
                        content: `❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`
                    })
                } catch (replyError) {
                    // If editReply fails, the token might have expired, so try to send a follow-up
                    logger.warn(`Failed to edit reply with error message: ${replyError instanceof Error ? replyError.message : 'Unknown error'}`)
                    try {
                        await followUp({
                            content: `❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            flags: ephemeral ? MessageFlags.Ephemeral : undefined
                        })
                    } catch (finalError) {
                        logger.error(`Failed to send any error message: ${finalError instanceof Error ? finalError.message : 'Unknown error'}`)
                    }
                }
            }
        }
    }
} satisfies SlashCommand
