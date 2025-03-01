import { ChannelType, SlashCommandBuilder, MessageFlags, TextChannel } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { MarkovChat } from '../modules/MarkovChain/MarkovChat'
import { Logger } from '../util/logger'

const logger = Logger.new('/markov')

export default {
    data: new SlashCommandBuilder()
        .setName('markov')
        .setDescription('Generate messages using Markov chains')
        .addSubcommand(subcommand => subcommand
            .setName('generate')
            .setDescription('Generate a message using collected data')
            .addUserOption(option => option
                .setName('user')
                .setDescription('Filter messages to this user')
                .setRequired(false)
            )
            .addStringOption(option => option
                .setName('source')
                .setDescription('Where to generate messages from')
                .setRequired(false)
                .addChoices(
                    { name: 'This Server', value: 'guild' },
                    { name: 'Specific Channel', value: 'channel' },
                    { name: 'Global', value: 'global' }
                )
            )
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel to generate from (only if source is "Specific Channel")')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addIntegerOption(option => option
                .setName('words')
                .setDescription('Number of words to generate (default: 20)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(100)
            )
            .addStringOption(option => option
                .setName('seed')
                .setDescription('Start the chain with these words')
                .setRequired(false)
            )
            .addBooleanOption(option => option
                .setName('show_sources')
                .setDescription('Show which messages were used to generate the text')
                .setRequired(false)
            )
            .addBooleanOption(option => option
                .setName('ephemeral')
                .setDescription('Only show the response to you')
                .setRequired(false)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('collect')
            .setDescription('Collect messages to build Markov chains from')
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel to collect messages from')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addUserOption(option => option
                .setName('user')
                .setDescription('Only collect messages from this user')
                .setRequired(false)
            )
            .addIntegerOption(option => option
                .setName('limit')
                .setDescription('Maximum number of messages to collect (default: 1000)')
                .setRequired(false)
            )
            .addBooleanOption(option => option
                .setName('ephemeral')
                .setDescription('Only show the response to you')
                .setRequired(false)
            )
        ),
    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

        if (!interaction.guild) {
            logger.info('Command used outside of a server')
            await interaction.reply({
                content: '❌ This command can only be used in a server',
                flags: MessageFlags.Ephemeral
            })
            return
        }

        const subcommand = interaction.options.getSubcommand()
        const markov = MarkovChat.getInstance()

        if (subcommand === 'generate') {
            const user = interaction.options.getUser('user') ?? undefined
            const source = interaction.options.getString('source') ?? 'guild'
            const channel = (interaction.options.getChannel('channel') as TextChannel | null) ?? undefined
            const words = interaction.options.getInteger('words') ?? 20
            const seed = interaction.options.getString('seed') ?? undefined
            const showSources = interaction.options.getBoolean('show_sources') ?? false

            // Validate channel is provided when source is 'channel'
            if (source === 'channel' && !channel) {
                logger.info('Channel not provided for "Specific Channel" source')
                await interaction.reply({
                    content: '❌ You must specify a channel when using "Specific Channel" as the source',
                    flags: MessageFlags.Ephemeral
                })
                return
            }

            // Validate channel is not provided for other sources
            if (source !== 'channel' && channel) {
                logger.info('Channel provided for non-"Specific Channel" source')
                await interaction.reply({
                    content: '❌ Channel option should only be used with "Specific Channel" source',
                    flags: MessageFlags.Ephemeral
                })
                return
            }

            await interaction.deferReply({ ephemeral })

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
                logger.ok(`Generated message: ${result.text}`)

                let response = `${result.text}\n-# - Generated in ${timeEnd - timeStart}ms`

                if (showSources && result.messageLinks.length > 0) {
                    const truncatedLinks = result.messageLinks.slice(0, 5)
                    response += `\n💬 Sources: ${truncatedLinks.join('\n')}`

                    if (result.messageLinks.length > 5) {
                        response += `\n...and ${result.messageLinks.length - 5} more sources`
                    }
                }

                await interaction.editReply(response)
            } catch (error) {
                logger.warn(`Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}`)
                await interaction.editReply({
                    content: `❌ Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }
        } else if (subcommand === 'collect') {
            const channel = interaction.options.getChannel('channel', true) as TextChannel
            const user = interaction.options.getUser('user') ?? undefined
            const limit = interaction.options.getInteger('limit') ?? 1000

            // Reply immediately instead of deferring
            await interaction.reply({
                content: `🔍 Starting to collect messages from ${channel}${user ? ` by ${user}` : ''}...`,
                ephemeral
            })

            try {
                logger.info(`Collecting messages from ${channel}${user ? ` by ${user.tag}` : ''}, limit: ${limit}`)

                // Setup progress updates
                let lastUpdateBatch = 0

                markov.on('collectProgress', async (progress) => {
                    // Update every 10 batches
                    if (progress.batchNumber % 10 === 0 || progress.batchNumber === 1) {
                        logger.info(`Progress update: ${progress.batchNumber} batches, ${progress.totalCollected}/${progress.limit} messages (${progress.percentComplete.toFixed(1)}%)`)
                        lastUpdateBatch = progress.batchNumber
                        await interaction.editReply(
                            `⏳ Collecting messages from ${channel}${user ? ` by ${user}` : ''}...\n` +
                            `📊 Progress: ${progress.totalCollected}/${progress.limit} messages (${progress.percentComplete.toFixed(1)}%)\n` +
                            `📚 Batches processed: ${progress.batchNumber}`
                        ).catch(err => {
                            logger.warn(`Failed to update progress: ${err.message}`)
                        })
                    }
                })

                // Process in one go
                const count = await markov.collectMessages(channel, {
                    user,
                    limit
                })

                // Clean up event listener to prevent memory leaks
                markov.removeAllListeners('collectProgress')

                logger.ok(`Collected ${count} messages from ${channel}${user ? ` by ${user.tag}` : ''}`)
                await interaction.editReply(`✅ Successfully collected ${count} messages from ${channel}${user ? ` by ${user}` : ''}`)
            } catch (error) {
                // Clean up event listener in case of error
                markov.removeAllListeners('collectProgress')

                logger.warn(`Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`)
                await interaction.editReply({
                    content: `❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`
                })
            }
        }
    }
} satisfies SlashCommand
