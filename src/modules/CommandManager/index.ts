import { singleton, inject, container } from 'tsyringe'
import { Logger } from '../Logger'
import { red, yellow } from '../../util/colors'
const logger = new Logger('CommandManager')

import { Message, MessageFlags } from 'discord.js'
import type { Message as StoatMessage } from 'stoat.js'
import type {
    Client,
    CommandInteraction,
    ContextMenuCommandInteraction,
    MessageContextMenuCommandInteraction,
    UserContextMenuCommandInteraction,
    Guild,
    User
} from 'discord.js'

import path from 'path'
import { fileURLToPath } from 'url'

import { getUserAvatar } from '../../util/functions'
import { CrimsonChat, OperationTracker } from '../'

import { ClassNotInitializedError, MissingPermissionsError } from '../../types'
import type {
    SlashCommand,
    ContextMenuCommand,
    OldSlashCommandHelpers,
    GuildOnlyCommandContext
} from '../../types'

import { EMBI_ID, PING_EMBI } from '../../util/constants'

import { CommandContext } from './CommandContext'
import { CommandRegistry } from './CommandRegistry'
import { TextCommandParser } from './TextCommandParser'
import { CommandDeployer } from './CommandDeployer'
import { CommandHotReloader } from './CommandHotReloader'

import { BotSettingsManager } from '../BotSettingsManager'
import { BanishmentManager } from '../BanishmentManager'
import { ServerConfigManager } from '../ServerConfig'
import { MarkovChat } from '../MarkovChain'
import { TagManager } from '../TagSystem'
import { LongTermMemoryManager } from '../LongTermMemory'
import { MarkovBotManager } from '../MarkovBotManager'

import type { IPlatformMessage } from '../../platform/interfaces'
import { PlatformManager } from '../../platform/PlatformManager'

@singleton()
export class CommandManager {
    private initialized = false

    public constructor(
        @inject('Client') private client: Client,
        private registry: CommandRegistry,
        private deployer: CommandDeployer,
        private hotReloader: CommandHotReloader,
        private operationTracker: OperationTracker,
        private botSettingsManager: BotSettingsManager,
        private banishmentManager: BanishmentManager,
        private serverConfigManager: ServerConfigManager,
        private markovChat: MarkovChat,
        private tagManager: TagManager,
        private longTermMemoryManager: LongTermMemoryManager,
        private markovBotManager: MarkovBotManager,
        private platformManager: PlatformManager
    ) {}

    public async init() {
        logger.info('{init} Initializing...')
        const initStartTime = process.hrtime.bigint()

        const currentDir = path.dirname(fileURLToPath(import.meta.url))
        await this.registry.loadCommands(
            path.join(currentDir, '../../commands')
        )

        await this.refreshGlobalCommands()
        await this.refreshAllGuildCommands()

        this.hotReloader.start()

        this.initialized = true

        const initEndTime = process.hrtime.bigint()
        const totalTime = Number(initEndTime - initStartTime) / 1_000_000_000
        logger.ok(`{init} Total time: ${yellow(totalTime)}s`)
    }

    public async refreshGlobalCommands(): Promise<void> {
        await this.deployer.refreshGlobalCommands()
    }

    public async refreshAllGuildCommands(): Promise<void> {
        await this.deployer.refreshAllGuildCommands()
    }

    public async deleteAllGlobalCommands(): Promise<void> {
        await this.deployer.deleteAllGlobalCommands()
    }

    public async deleteAllRegisteredGuildCommands(): Promise<void> {
        await this.deployer.deleteAllRegisteredGuildCommands()
    }

    public async reloadCommand(commandName: string): Promise<void> {
        await this.hotReloader.reloadCommand(commandName)
    }

    public async handleInteraction(
        interaction: CommandInteraction | ContextMenuCommandInteraction
    ): Promise<void> {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (
            !interaction.isChatInputCommand() &&
            !interaction.isContextMenuCommand()
        )
            return

        const commandName = interaction.commandName
        let command: SlashCommand | ContextMenuCommand | undefined

        if (interaction.isChatInputCommand()) {
            command = this.findMatchingSlashCommand(
                interaction.commandName,
                interaction.guildId
            )
        } else if (interaction.isContextMenuCommand()) {
            const type = interaction.isUserContextMenuCommand()
                ? 'user'
                : 'message'
            const key = `${interaction.commandName}-${type}`
            command = this.registry.contextMenuCommands.get(key)
        }

        if (!command) {
            const errorMessage = `Command ${commandName} not found for interaction.`
            logger.warn(
                `{handleInteraction} Unknown command /${yellow(commandName)}`
            )
            this.handleError(new Error(errorMessage), interaction)
            return
        }

        try {
            if (
                interaction.isChatInputCommand() &&
                (this.registry.isGlobalSlashCommand(command) ||
                    this.registry.isGuildSlashCommand(command))
            ) {
                const context = new CommandContext(interaction, {
                    banishmentManager: this.banishmentManager,
                    crimsonChat: container.resolve(CrimsonChat),
                    serverConfigManager: this.serverConfigManager,
                    markovChat: this.markovChat,
                    tagManager: this.tagManager,
                    operationTracker: this.operationTracker,
                    botSettingsManager: this.botSettingsManager,
                    commandManager: this,
                    longTermMemoryManager: this.longTermMemoryManager,
                    markovBotManager: this.markovBotManager
                })
                await this.executeUnifiedCommand(command, context)
            } else if (
                interaction.isContextMenuCommand() &&
                this.registry.isContextMenuCommand(command)
            ) {
                const helpersForContextMenu: OldSlashCommandHelpers = {
                    reply: interaction.reply.bind(interaction),
                    deferReply: interaction.deferReply.bind(interaction),
                    editReply: interaction.editReply.bind(interaction),
                    followUp: interaction.followUp.bind(interaction),
                    getUserAvatar: (user: User, guild: Guild | null, options) =>
                        getUserAvatar(
                            user,
                            guild || interaction.guild,
                            options
                        ),
                    client: interaction.client,
                    guild: interaction.guild,
                    embiId: EMBI_ID,
                    pingEmbi: PING_EMBI
                }
                if (
                    interaction.isUserContextMenuCommand() &&
                    command.type === 2
                ) {
                    await (
                        command.execute as (
                            helpers: OldSlashCommandHelpers,
                            i?: UserContextMenuCommandInteraction,
                        ) => Promise<void>
                    )(helpersForContextMenu, interaction)
                } else if (
                    interaction.isMessageContextMenuCommand() &&
                    command.type === 3
                ) {
                    await (
                        command.execute as (
                            helpers: OldSlashCommandHelpers,
                            i?: MessageContextMenuCommandInteraction,
                        ) => Promise<void>
                    )(helpersForContextMenu, interaction)
                } else {
                    throw new Error(
                        'Context menu command type mismatch with interaction type'
                    )
                }
            } else {
                throw new Error(
                    'Command type mismatch with interaction type for execution.'
                )
            }
        } catch (e) {
            this.handleError(e as Error, interaction)
        }
    }

    /**
     * Handle message commands from any platform (Discord or Stoat)
     * This is the platform-agnostic version that works with both platforms
     */
    public async handlePlatformMessage(
        message: IPlatformMessage,
        prefix: string
    ): Promise<void> {
        if (!this.initialized) {
            logger.warn('{handlePlatformMessage} CommandManager not initialized')
            return
        }

        // Ensure message content is defined before checking startsWith
        if (!message || !message.content) {
            logger.warn('{handlePlatformMessage} Received message with undefined content')
            return
        }

        if (!message.content.startsWith(prefix)) return

        // Safely check author.bot
        if (message.author?.bot) {
            logger.debug('{handlePlatformMessage} Ignoring bot message')
            return
        }

        // Check permissions for sending messages
        if (message.server) {
            const botMember = message.server.getMember(
                this.client.user?.id || ''
            )
            if (botMember && !botMember.havePermission('SendMessages')) {
                logger.warn(
                    `{handlePlatformMessage} No permission to send messages in channel ${message.channel.name} (${message.channel.id})`
                )
                return
            }
        }

        const { commandName, rawArgsString } =
            TextCommandParser.parseCommandFromMessage(message.content, prefix)
        if (!commandName) return

        logger.debug(`{handlePlatformMessage} Parsed command: ${commandName}`)

        const command = this.findMatchingSlashCommand(
            commandName,
            message.server?.id
        )

        if (!command || !this.registry.isSlashCommand(command)) {
            logger.debug(`{handlePlatformMessage} Command not found: ${commandName}`)
            return
        }

        try {
            // Create context for platform message
            const context = await this.createContextForPlatformMessage(
                message,
                command,
                rawArgsString,
                prefix
            )

            if (
                context.parsedArgs?.h === true ||
                context.parsedArgs?.help === true
            ) {
                const finalArgsString =
                    TextCommandParser._reconstructArgumentsForYargs(
                        rawArgsString,
                        command
                    )
                const yargsParser =
                    TextCommandParser._buildYargsParserForCommand(
                        command,
                        message.raw as Message, // Cast raw to Message for parser (duck typing for reply())
                        finalArgsString,
                        prefix
                    )
                const helpText = await yargsParser.getHelp()
                await message.reply(`\n${helpText.trim()}\n`)
                return
            }

            logger.debug(`{handlePlatformMessage} Executing command: ${commandName}`)
            await this.executeUnifiedCommand(command, context)
        } catch (e) {
            const error = e as Error & { name?: string }
            if (error.name === 'YError') {
                logger.warn(
                    `{handlePlatformMessage} Yargs validation error for "${commandName}". .fail() should have replied.`
                )
            } else {
                await this.handlePlatformError(error, message, commandName)
            }
        }
    }

    /**
     * Create CommandContext from a platform message (works for both Discord and Stoat)
     */
    private async createContextForPlatformMessage(
        message: IPlatformMessage,
        command: SlashCommand,
        rawArgsString: string,
        prefix: string
    ): Promise<CommandContext> {
        const finalArgsString = TextCommandParser._reconstructArgumentsForYargs(
            rawArgsString,
            command
        )
        const yargsParser = TextCommandParser._buildYargsParserForCommand(
            command,
            message.raw as Message, // Cast raw to Message for parser (duck typing for reply())
            finalArgsString,
            prefix
        )

        const parsedYargsArgs = await yargsParser.parseAsync()

        let source: Message | StoatMessage // Message or StoatMessage

        try {
            // Try to convert to Discord message first
            source = await this.convertPlatformMessageToDiscord(message)
        } catch {
            // If conversion fails, use the raw message (e.g. StoatMessage)
            source = message.raw
        }

        const context = new CommandContext(
            source,
            {
                banishmentManager: this.banishmentManager,
                crimsonChat: container.resolve(CrimsonChat),
                serverConfigManager: this.serverConfigManager,
                markovChat: this.markovChat,
                tagManager: this.tagManager,
                operationTracker: this.operationTracker,
                botSettingsManager: this.botSettingsManager,
                commandManager: this,
                longTermMemoryManager: this.longTermMemoryManager,
                markovBotManager: this.markovBotManager
            },
            rawArgsString.split(/ +/)
        )

        context.parsedArgs =
            parsedYargsArgs as unknown as import('yargs').ArgumentsCamelCase<{
                [key: string]: import('../../types').JSONResolvable
            }>

        TextCommandParser.setSubcommandContextFromArgs(
            context,
            context.parsedArgs,
            command.data.toJSON()
        )

        return context
    }

    /**
     * Convert platform message to Discord Message format
     * This is a bridge to maintain backward compatibility with existing CommandContext
     */
    private async convertPlatformMessageToDiscord(
        platformMessage: IPlatformMessage
    ): Promise<Message> {
        // For Discord messages, we can get the original Discord message
        if (this.platformManager.isPlatformEnabled('discord')) {
            const discordClient = this.client
            const channel = await discordClient.channels.fetch(
                platformMessage.channel.id
            )
            if (channel?.isTextBased()) {
                try {
                    // Try to fetch message, but ensure it's not null before returning
                    const discordMessage = await channel.messages.fetch(
                        platformMessage.id
                    )
                    return discordMessage
                } catch {
                    // Fall through to create a mock message
                }
            }
        }

        // For Stoat messages or if fetch fails, we need to create a mock
        // This is not ideal but maintains compatibility during migration
        throw new Error(
            'Stoat message handling requires CommandContext to be updated for platform abstractions'
        )
    }

    /**
     * Handle errors for platform messages
     */
    private async handlePlatformError(
        error: Error,
        message: IPlatformMessage,
        cmdName?: string
    ): Promise<void> {
        const commandName = cmdName || message.content.split(' ')[0].slice(1) // Remove prefix
        let replyMessage = `❌ Error executing ${commandName}: ${error.message}`

        if (error instanceof MissingPermissionsError) {
            replyMessage = `🚫 You don't have the required permissions for ${commandName}. Missing: ${error.permissions.join(', ')}`
        }

        logger.warn(
            `{handlePlatformError} Error in ${yellow(commandName)}: ${red(error.message)}`
        )
        if (error.stack) logger.warn(error.stack)

        await message
            .reply(replyMessage)
            .catch(err =>
                logger.warn(
                    `{handlePlatformError} Could not reply to message to signal error: [${red(err.message)}]`
                )
            )
    }

    /**
     * Legacy method for Discord-only message commands
     * Delegates to handlePlatformMessage for unified handling
     */
    public async handleMessageCommand(
        message: Message,
        prefix: string
    ): Promise<void> {
        try {
            // Convert Discord message to platform message and use unified handler
            const platformMessage = await this.convertDiscordMessageToPlatform(message)
            await this.handlePlatformMessage(platformMessage, prefix)
        } catch (error) {
            logger.error(`Error in handleMessageCommand: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Convert Discord Message to IPlatformMessage
     */
    private async convertDiscordMessageToPlatform(
        message: Message
    ): Promise<IPlatformMessage> {
        // This should use the Discord adapter's conversion
        // For now, we use a simple adapter lookup
        const discordClient = this.platformManager.getClient('discord')
        if (!discordClient) {
            throw new Error('Discord client not available')
        }

        // Get the message through the adapter's channel
        const channel = discordClient.getChannel(message.channel.id)
        if (!channel) {
            throw new Error('Channel not found in platform adapter')
        }

        // Use the adapter's fetchMessage method and handle potential null/Promise return
        const platformMessage = await channel.fetchMessage(message.id)
        if (!platformMessage) {
             throw new Error('Failed to fetch platform message from adapter')
        }
        return platformMessage
    }

    private findMatchingSlashCommand(
        commandName: string,
        guildId?: string | null
    ): SlashCommand | undefined {
        if (!this.registry) return undefined

        if (guildId) {
            const guildCommands = this.registry.guildCommands.get(guildId)
            if (guildCommands) {
                const guildCommand = guildCommands.get(commandName)
                if (guildCommand) return guildCommand
            }
        }
        return this.registry.globalCommands.get(commandName)
    }

    private async executeUnifiedCommand(
        command: SlashCommand,
        context: CommandContext
    ): Promise<void> {
        const commandIdentifier =
            this.registry!.isGlobalSlashCommand(command) ||
            this.registry!.isGuildSlashCommand(command)
                ? command.data.name
                : 'unknown_command'

        return this.operationTracker.track(
            `command:${commandIdentifier}`,
            context.isInteraction ? 'SLASH_COMMAND' : 'TEXT_COMMAND',
            async () => {
                try {
                    if (!command.execute) {
                        throw new Error(
                            `Command ${commandIdentifier} does not have an execute method`
                        )
                    }
                    const memberPerms = context.memberPermissions
                    if (command.permissions && memberPerms) {
                        const missing = memberPerms.missing(
                            command.permissions.map(p => p.valueOf())
                        )
                        if (missing.length > 0) {
                            throw new MissingPermissionsError(
                                `You are missing the following permissions: ${missing.join(', ')}`,
                                missing
                            )
                        }
                    } else if (command.permissions && !memberPerms) {
                        throw new Error(
                            'Could not determine member permissions.'
                        )
                    }

                    if (this.registry!.isGuildSlashCommand(command)) {
                        if (!context.guild || !context.member) {
                            logger.warn(
                                `{executeUnifiedCommand} The server command "${command.data.name}" was executed outside of a server. This should not happen.`
                            )
                            await context.reply(
                                '❌ This command can only be used in a server.'
                            )
                            return
                        }
                        await command.execute(
                            context as GuildOnlyCommandContext
                        )
                    } else {
                        await command.execute(context)
                    }
                } catch (err) {
                    const error = err as Error
                    logger.warn(
                        `{executeUnifiedCommand} Error in ${yellow(commandIdentifier)} (${context.isInteraction ? 'Interaction' : 'Message'}): ${red(error.message)}`
                    )
                    if (
                        error.message
                            .toLowerCase()
                            .includes('unknown interaction') ||
                        error.message.toLowerCase().includes('unknown message')
                    ) {
                        logger.warn(
                            '{executeUnifiedCommand} Discord API error, interaction/message may have timed out or been deleted.'
                        )
                        return
                    }
                    throw error
                }
            }
        )
    }

    private handleError(
        e: Error,
        source: CommandInteraction | ContextMenuCommandInteraction | Message,
        cmdName?: string,
        prefix?: string
    ): void {
        const commandName =
            cmdName ||
            (source instanceof Message
                ? source.content.split(' ')[0].slice(prefix!.length)
                : (source as CommandInteraction).commandName)
        let replyMessage = `❌ Error executing ${commandName}: ${e.message}`

        if (e instanceof MissingPermissionsError) {
            replyMessage = `🚫 You don't have the required permissions for ${commandName}. Missing: ${e.permissions.join(', ')}`
        }

        logger.warn(
            `{handleError} Error in ${yellow(commandName)}: ${red(e.message)}`
        )
        if (e.stack) logger.warn(e.stack)

        if (source instanceof Message) {
            source
                .reply(replyMessage)
                .catch(err =>
                    logger.warn(
                        `{handleError} Could not reply to message to signal error: [${red(err.message)}]`
                    )
                )
        } else {
            if (!source.isRepliable()) {
                logger.warn(
                    `{handleError} Interaction for ${commandName} is not repliable.`
                )
                return
            }

            if (source.deferred || source.replied) {
                source
                    .editReply(replyMessage)
                    .catch(err =>
                        logger.warn(
                            `{handleError} Could not editReply to interaction for ${commandName}: [${red(err.message)}]`
                        )
                    )
            } else {
                source
                    .reply({
                        content: replyMessage,
                        flags: MessageFlags.Ephemeral
                    })
                    .catch(err =>
                        logger.warn(
                            `{handleError} Could not reply to interaction for ${commandName}: [${red(err.message)}]`
                        )
                    )
            }
        }
    }
}
