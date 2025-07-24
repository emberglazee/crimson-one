import { Logger, yellow, red } from '../../util/logger'
const logger = new Logger('CommandManager')

import { Message, PermissionsBitField, GuildChannel, MessageFlags } from 'discord.js'
import type { Client, CommandInteraction, ContextMenuCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction, Guild, User } from 'discord.js'

import path from 'path'
import { fileURLToPath } from 'url'

import { getUserAvatar } from '../../util/functions'
import { operationTracker } from '../OperationTracker'

import { ClassNotInitializedError, MissingPermissionsError } from '../../types'
import type { SlashCommand, ContextMenuCommand, OldSlashCommandHelpers, GuildOnlyCommandContext } from '../../types'

import { EMBI_ID, PING_EMBI } from '../../util/constants'
import { crimsonChat } from '../..'
import { CommandContext } from './CommandContext'
import { CommandRegistry } from './CommandRegistry'
import { TextCommandParser } from './TextCommandParser'
import { CommandDeployer } from './CommandDeployer'

export default class CommandManager {
    private static instance: CommandManager

    private initialized = false
    private client: Client | null = null
    private registry: CommandRegistry | null = null
    private deployer: CommandDeployer | null = null

    private constructor() {}

    public static getInstance(): CommandManager {
        if (!CommandManager.instance) {
            CommandManager.instance = new CommandManager()
        }
        return CommandManager.instance
    }

    public setClient(client: Client): CommandManager {
        this.client = client
        this.registry = new CommandRegistry(client)
        this.deployer = new CommandDeployer(client, this.registry)
        return this
    }

    public async init() {
        if (!this.client || !this.registry) throw new Error('Client not set. Call setClient() first.')

        logger.info('{init} Initializing...')
        const initStartTime = process.hrtime.bigint()

        const currentDir = path.dirname(fileURLToPath(import.meta.url))
        await this.registry.loadCommands(path.join(currentDir, '../../commands'))

        await this.refreshGlobalCommands()
        await this.refreshAllGuildCommands()

        this.initialized = true

        const initEndTime = process.hrtime.bigint()
        const totalTime = Number(initEndTime - initStartTime) / 1_000_000_000
        logger.ok(`{init} Total time: ${yellow(totalTime)}s`)
    }

    public async refreshGlobalCommands(): Promise<void> {
        if (!this.deployer) throw new ClassNotInitializedError()
        await this.deployer.refreshGlobalCommands()
    }

    public async refreshAllGuildCommands(): Promise<void> {
        if (!this.deployer) throw new ClassNotInitializedError()
        await this.deployer.refreshAllGuildCommands()
    }

    public async deleteAllGlobalCommands(): Promise<void> {
        if (!this.deployer) throw new ClassNotInitializedError()
        await this.deployer.deleteAllGlobalCommands()
    }

    public async deleteAllRegisteredGuildCommands(): Promise<void> {
        if (!this.deployer) throw new ClassNotInitializedError()
        await this.deployer.deleteAllRegisteredGuildCommands()
    }

    public async handleInteraction(interaction: CommandInteraction | ContextMenuCommandInteraction): Promise<void> {
        if (!this.initialized || !this.registry) throw new ClassNotInitializedError()
        if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return

        const commandName = interaction.commandName
        let command: SlashCommand | ContextMenuCommand | undefined

        if (interaction.isChatInputCommand()) {
            command = this.findMatchingSlashCommand(interaction.commandName, interaction.guildId)
        } else if (interaction.isContextMenuCommand()) {
            const type = interaction.isUserContextMenuCommand() ? 'user' : 'message'
            const key = `${interaction.commandName}-${type}`
            command = this.registry.contextMenuCommands.get(key)
        }

        if (!command) {
            const errorMessage = `Command ${commandName} not found for interaction.`
            logger.warn(`{handleInteraction} Unknown command /${yellow(commandName)}`)
            this.handleError(new Error(errorMessage), interaction)
            return
        }

        try {
            if (interaction.isChatInputCommand() && (this.registry.isGlobalSlashCommand(command) || this.registry.isGuildSlashCommand(command))) {
                const context = new CommandContext(interaction)
                await this.executeUnifiedCommand(command, context)
            } else if (interaction.isContextMenuCommand() && this.registry.isContextMenuCommand(command)) {
                const helpersForContextMenu: OldSlashCommandHelpers = {
                    reply: interaction.reply.bind(interaction),
                    deferReply: interaction.deferReply.bind(interaction),
                    editReply: interaction.editReply.bind(interaction),
                    followUp: interaction.followUp.bind(interaction),
                    getUserAvatar: (user: User, guild: Guild | null, options) => getUserAvatar(user, guild || interaction.guild, options),
                    client: interaction.client,
                    guild: interaction.guild,
                    embiId: EMBI_ID,
                    pingEmbi: PING_EMBI
                }
                if (interaction.isUserContextMenuCommand() && command.type === 2) {
                    await (command.execute as (helpers: OldSlashCommandHelpers, i?: UserContextMenuCommandInteraction) => Promise<void>)(helpersForContextMenu, interaction)
                } else if (interaction.isMessageContextMenuCommand() && command.type === 3) {
                    await (command.execute as (helpers: OldSlashCommandHelpers, i?: MessageContextMenuCommandInteraction) => Promise<void>)(helpersForContextMenu, interaction)
                } else {
                    throw new Error('Context menu command type mismatch with interaction type')
                }
            } else {
                throw new Error('Command type mismatch with interaction type for execution.')
            }
        } catch (e) {
            this.handleError(e as Error, interaction)
        }
    }

    public async handleMessageCommand(message: Message, prefix: string): Promise<void> {
        if (!this.initialized || !this.registry || !message.content.startsWith(prefix) || message.author.bot) return

        if (message.channel instanceof GuildChannel) {
            const me = await message.guild?.members.fetchMe()
            if (me && !message.channel.permissionsFor(me).has(PermissionsBitField.Flags.SendMessages)) {
                logger.warn(`{handleMessageCommand} No permission to send messages in channel #${message.channel.name} (${message.channel.id})`)
                return
            }
        }

        const { commandName, rawArgsString } = TextCommandParser.parseCommandFromMessage(message.content, prefix)
        if (!commandName) return

        const command = this.findMatchingSlashCommand(commandName, message.guildId)

        if (!command || !this.registry.isSlashCommand(command)) {
            return
        }

        try {
            const context = await TextCommandParser.createContextForMessageCommand(message, command, rawArgsString, prefix)

            if (context.parsedArgs?.h === true || context.parsedArgs?.help === true) {
                const finalArgsString = TextCommandParser._reconstructArgumentsForYargs(rawArgsString, command)
                const yargsParser = TextCommandParser._buildYargsParserForCommand(command, message, finalArgsString, prefix)
                const helpText = await yargsParser.getHelp()
                await message.reply(`\`\`\`\n${helpText.trim()}\n\`\`\``)
                return
            }

            await this.executeUnifiedCommand(command, context)
        } catch (e) {
            const error = e as Error & { name?: string }
            if (error.name === 'YError') {
                logger.warn(`{handleMessageCommand} Yargs validation error for "${commandName}". .fail() should have replied.`)
            } else {
                this.handleError(error, message, commandName)
            }
        }
    }

    private findMatchingSlashCommand(commandName: string, guildId?: string | null): SlashCommand | undefined {
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

    private async executeUnifiedCommand(command: SlashCommand, context: CommandContext): Promise<void> {
        const commandIdentifier = (this.registry!.isGlobalSlashCommand(command) || this.registry!.isGuildSlashCommand(command))
            ? command.data.name
            : 'unknown_command'

        return operationTracker.track(
            `command:${commandIdentifier}`,
            context.isInteraction ? 'SLASH_COMMAND' : 'TEXT_COMMAND',
            async () => {
                try {
                    if (!command.execute) {
                        throw new Error(`Command ${commandIdentifier} does not have an execute method`)
                    }
                    const memberPerms = context.memberPermissions
                    if (command.permissions && memberPerms) {
                        const missing = memberPerms.missing(command.permissions.map(p => p.valueOf()))
                        if (missing.length > 0) {
                            throw new MissingPermissionsError(
                                `You are missing the following permissions: ${missing.join(', ')}`,
                                missing
                            )
                        }
                    } else if (command.permissions && !memberPerms) {
                        throw new Error('Could not determine member permissions.')
                    }

                    if (this.registry!.isGuildSlashCommand(command)) {
                        if (!context.guild || !context.member) {
                            logger.warn(`{executeUnifiedCommand} Guild command "${command.data.name}" was executed in a non-guild context. This should not happen.`)
                            await context.reply("❌ This command can only be used in a server.")
                            return
                        }
                        await command.execute(context as GuildOnlyCommandContext)
                    } else {
                        await command.execute(context)
                    }

                    if (context.channel?.id === crimsonChat.channelId) {
                        await crimsonChat.logCommandExecution(command, context)
                    }
                } catch (err) {
                    const error = err as Error
                    logger.warn(`{executeUnifiedCommand} Error in ${yellow(commandIdentifier)} (${context.isInteraction ? 'Interaction' : 'Message'}): ${red(error.message)}`)
                    if (error.message.toLowerCase().includes('unknown interaction') || error.message.toLowerCase().includes('unknown message')) {
                        logger.warn(`{executeUnifiedCommand} Discord API error, interaction/message may have timed out or been deleted.`)
                        return
                    }
                    throw error
                }
            }
        )
    }

    private handleError(e: Error, source: CommandInteraction | ContextMenuCommandInteraction | Message, cmdName?: string, prefix?: string): void {
        const commandName = cmdName || ((source instanceof Message) ? source.content.split(' ')[0].slice(prefix!.length) : (source as CommandInteraction).commandName)
        let replyMessage = `❌ Error executing \`${commandName}\`: \`${e.message}\``

        if (e instanceof MissingPermissionsError) {
            replyMessage = `🚫 You don't have the required permissions for \`${commandName}\`. Missing: \`${e.permissions.join(', ')}\``
        }

        logger.warn(`{handleError} Error in ${yellow(commandName)}: ${red(e.message)}`)
        if (e.stack) logger.warn(e.stack)

        if (source instanceof Message) {
            source.reply(replyMessage).catch(err =>
                logger.warn(`{handleError} Could not reply to message to signal error: [${red(err.message)}]`)
            )
        } else {
            if (!source.isRepliable()) {
                logger.warn(`{handleError} Interaction for ${commandName} is not repliable.`)
                return
            }

            if (source.deferred || source.replied) {
                source.editReply(replyMessage).catch(err =>
                    logger.warn(`{handleError} Could not editReply to interaction for ${commandName}: [${red(err.message)}]`)
                )
            } else {
                source.reply({ content: replyMessage, flags: MessageFlags.Ephemeral }).catch(err =>
                    logger.warn(`{handleError} Could not reply to interaction for ${commandName}: [${red(err.message)}]`)
                )
            }
        }
    }
}
