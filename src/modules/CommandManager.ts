const esmodules = !!import.meta.url

import { Logger, yellow, red } from '../util/logger'
const logger = new Logger('CommandManager')

import {
    SlashCommandBuilder,
    ContextMenuCommandBuilder, Client, CommandInteraction,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
    type RESTPostAPIContextMenuApplicationCommandsJSONBody,
    REST, Routes, ContextMenuCommandInteraction,
    MessageContextMenuCommandInteraction,
    UserContextMenuCommandInteraction,
    Message,
    User,
    Guild,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction
} from 'discord.js'

import { readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getUserAvatar, hasProp } from '../util/functions'
import { operationTracker } from './OperationTracker'

import { createHash } from 'crypto'

import {
    SlashCommand, GuildSlashCommand, ContextMenuCommand,
    ClassNotInitializedError, MissingPermissionsError,
    type ExplicitAny, type GuildId,
    CommandContext,
    type JSONResolvable,
    type OldSlashCommandHelpers
} from '../types/types'
import { EMBERGLAZE_ID, PING_EMBERGLAZE } from '../util/constants'
import type { ArgumentsCamelCase, Argv, Options as YargsOptions } from 'yargs'
import yargs from 'yargs'

export default class CommandManager {

    private static instance: CommandManager
    private globalCommands: Map<string, SlashCommand> = new Map()
    private guildCommands: Map<GuildId, Map<string, GuildSlashCommand>> = new Map()
    private contextMenuCommands: Map<string, ContextMenuCommand> = new Map()
    private commandHashes: Map<string, string> = new Map()
    private initialized = false
    private client: Client | null = null
    private rest: REST | null = null
    public readonly prefix: string

    private constructor(prefix = 'c1') {
        this.prefix = prefix
    }

    public static getInstance(prefix = 'c1'): CommandManager {
        if (!CommandManager.instance) {
            CommandManager.instance = new CommandManager(prefix)
        }
        return CommandManager.instance
    }

    public setClient(client: Client) {
        this.client = client
        this.rest = new REST().setToken(client.token!)
        this.client.on('messageCreate', async message => {
            if (message.author.bot || !message.guild) return
            // Basic check for prefix to avoid parsing every message with yargs
            if (message.content.startsWith(this.prefix)) {
                await this.handleMessageCommand(message)
            }
        })
    }

    public async init() {

        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{init} Initializing...')
        const initStartTime = Date.now()

        await this.loadCommands(path.join(esmodules ? path.dirname(fileURLToPath(import.meta.url)) : __dirname, '../commands'))
        this.initialized = true

        const initEndTime = Date.now()
        const totalTime = (initEndTime - initStartTime) / 1000
        logger.ok(`{init} Total time: ${yellow(totalTime)}s`)

    }



    private async importCommand(file: Dirent) {

        const startTime = Date.now()
        try {

            const importedModule = await import(path.join(esmodules ? path.dirname(fileURLToPath(import.meta.url)) : __dirname, `../commands/${file.name}`))
            const commands: (SlashCommand | ContextMenuCommand)[] = []
            const commandInfo: { name: string, type: string, guildId?: GuildId, aliases?: string[] }[] = [] // Added aliases

            // Handle both default and named exports
            for (const [_, exportedItem] of Object.entries(importedModule)) {

                if (typeof exportedItem !== 'object' || !exportedItem) continue
                if (!('data' in exportedItem) || !('execute' in exportedItem)) continue
                const command = exportedItem as SlashCommand | ContextMenuCommand

                if (CommandManager.isContextMenuCommand(command)) {

                    const type = command.type === 2 ? 'user' : 'message'
                    command.data.setType(command.type)

                    const key = `${command.data.name}-${type}`
                    this.contextMenuCommands.set(key, command)
                    commands.push(command)
                    commandInfo.push({ name: command.data.name, type: `${type} context menu` })

                } else if (CommandManager.isGuildSlashCommand(command)) {

                    if (!this.guildCommands.has(command.guildId)) this.guildCommands.set(command.guildId, new Map())
                    this.guildCommands.get(command.guildId)!.set(command.data.name, command)
                    commands.push(command)
                    commandInfo.push({ name: command.data.name, type: 'guild slash', guildId: command.guildId })

                } else if (CommandManager.isGlobalSlashCommand(command)) {

                    this.globalCommands.set(command.data.name, command)
                    if (command.aliases) command.aliases.forEach(alias => this.globalCommands.set(alias, command)) // Add aliases
                    commands.push(command)
                    commandInfo.push({ name: command.data.name, type: 'global slash/text', aliases: command.aliases })

                }
            }

            if (commands.length === 0) {
                return { file: file.name, commands: [], time: Date.now() - startTime }
            }

            return { file: file.name, commands: commandInfo, time: Date.now() - startTime }

        } catch (err) {
            logger.warn(`{loadCommands} Error loading commands from ${yellow(file.name)}: ${err}`)
            return { file: file.name, commands: [], time: Date.now() - startTime, error: err }
        }

    }



    private async loadCommands(dir: string) {

        logger.info(`{loadCommands} Reading commands from ${yellow(dir)}...`)
        const files = await readdir(dir, { withFileTypes: true })
        logger.info(`{loadCommands} Found ${yellow(files.length)} files in ${yellow(dir)}`)

        const importPromises: Promise<{ file: string; commands: { name: string; type: string; guildId?: string, aliases?: string[] }[]; time: number; error?: unknown }>[] = []
        for (const file of files) {

            if (file.isDirectory())
                await this.loadCommands(path.join(dir, file.name))
            else if (file.isFile() && file.name.endsWith('.ts'))
                importPromises.push(this.importCommand(file))

        }

        const results = await Promise.all(importPromises)
        const totalCommands = results.reduce((acc, result) => acc + result.commands.length, 0)
        const totalTime = results.reduce((acc, result) => acc + result.time, 0)
        logger.ok(`{loadCommands} Loaded ${yellow(totalCommands)} commands from ${yellow(results.length)} files in ${yellow(totalTime / 1000)}s`)

        const commandTypes = new Map<string, number>()
        const guildCommands = new Map<string, number>()
        results.forEach(result => {

            result.commands.forEach(cmd => {
                commandTypes.set(cmd.type, (commandTypes.get(cmd.type) || 0) + 1)
                if (cmd.guildId) guildCommands.set(cmd.guildId, (guildCommands.get(cmd.guildId) || 0) + 1)
            })

        })
        commandTypes.forEach((count, type) => logger.info(`{loadCommands} ${yellow(count)} ${type} commands`))
        if (guildCommands.size > 0) {

            logger.info('{loadCommands} Guild command distribution:')
            guildCommands.forEach((count, guildId) => {
                logger.info(`{loadCommands}   ${yellow(guildId)}: ${yellow(count)} commands`)
            })

        }
        logger.ok(`{loadCommands} Finished loading commands in ${yellow(dir)}`)

    }



    public async handleInteraction(interaction: CommandInteraction | ContextMenuCommandInteraction): Promise<void> {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return
        const commandName = interaction.commandName
        let command: SlashCommand | ContextMenuCommand | undefined
        if (interaction.isChatInputCommand()) {
            command = this.findMatchingSlashCommand(interaction.commandName, interaction.guildId)
        } else if (interaction.isContextMenuCommand()) {
            const type = interaction.isUserContextMenuCommand() ? 'user' : 'message'
            const key = `${interaction.commandName}-${type}`
            command = this.contextMenuCommands.get(key)
        }
        if (!command) {
            const errorMessage = `Command ${commandName} not found for interaction.`
            logger.warn(`{handleInteraction} Unknown command /${yellow(commandName)}`)
            this.handleError(new Error(errorMessage), interaction)
            return
        }
        try {

            if (interaction.isChatInputCommand() && (CommandManager.isGlobalSlashCommand(command) || CommandManager.isGuildSlashCommand(command))) {
                const context = new CommandContext(interaction as ChatInputCommandInteraction) // Ensure it's ChatInputCommandInteraction
                await this.executeUnifiedCommand(command, context)
            } else if (interaction.isContextMenuCommand() && CommandManager.isContextMenuCommand(command)) {
                const helpersForContextMenu: OldSlashCommandHelpers = {
                    reply: interaction.reply.bind(interaction),
                    deferReply: interaction.deferReply.bind(interaction),
                    editReply: interaction.editReply.bind(interaction),
                    followUp: interaction.followUp.bind(interaction),
                    getUserAvatar: (user: User, guild: Guild | null, options) => getUserAvatar(user, guild || interaction.guild, options),
                    client: interaction.client,
                    guild: interaction.guild,
                    myId: EMBERGLAZE_ID,
                    pingMe: PING_EMBERGLAZE
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



    public async handleMessageCommand(message: Message): Promise<void> {

        if (!this.initialized || !message.content.startsWith(this.prefix) || message.author.bot) return

        const contentWithoutPrefix = message.content.slice(this.prefix.length).trim()
        const commandParts = contentWithoutPrefix.split(/ +/)
        const commandName = commandParts[0]?.toLowerCase()

        if (!commandName) return

        const command = this.findMatchingSlashCommand(commandName, message.guildId)

        if (!command || (!CommandManager.isGlobalSlashCommand(command) && !CommandManager.isGuildSlashCommand(command))) {
            logger.warn(`{handleMessageCommand} Text command "${commandName}" not found.`)
            return
        }

        const context = new CommandContext(message, commandParts)
        try {

            const yargsParser = this.buildYargsParserForCommand(command as SlashCommand, message)
            const parsedYargsArgs = await yargsParser.parseAsync() // This should throw if fail() was called by demandCommand etc.

            // If parseAsync completed without throwing, it means validation (including demandCommand) passed.
            const yargsCommandPath = parsedYargsArgs._.map(String)
            const commandDataJson = command.data.toJSON()

            if (commandDataJson.options?.some(o => o.type === ApplicationCommandOptionType.SubcommandGroup)) {
                if (yargsCommandPath.length > 0) context.subcommandGroupName = yargsCommandPath[0]
                if (yargsCommandPath.length > 1) context.subcommandName = yargsCommandPath[1]
            } else if (commandDataJson.options?.some(o => o.type === ApplicationCommandOptionType.Subcommand)) {
                if (yargsCommandPath.length > 0) context.subcommandName = yargsCommandPath[0]
            }
            context.parsedArgs = parsedYargsArgs as ArgumentsCamelCase<{ [key: string]: JSONResolvable }>

            await this.executeUnifiedCommand(command as SlashCommand, context)

        } catch (e) {

            const error = e as Error & { name?: string } // Type assertion for name property
            // If yargs.parseAsync() throws an error AFTER .fail() has been called,
            // it typically means a validation failed (e.g., missing required arg, demandCommand).
            // The .fail() handler should have already sent a reply.
            if (error.name === 'YError') {
                logger.warn(`{handleMessageCommand} Yargs validation error for "${commandName}" (name: YError). .fail() should have replied.`)
                // No further action needed as .fail() is expected to handle the reply.
            } else {
                // This is likely an error from executeUnifiedCommand or CommandContext.getXOption's required check
                logger.warn(`{handleMessageCommand} Non-YError caught for "${commandName}": ${error.message}`)
                this.handleError(error, message, commandName)
            }

        }

    }


    private findMatchingSlashCommand(commandName: string, guildId?: string | null): SlashCommand | undefined {

        if (guildId) {
            const guildCommands = this.guildCommands.get(guildId)
            if (guildCommands) {
                const guildCommand = guildCommands.get(commandName)
                if (guildCommand) return guildCommand
            }
        }
        return this.globalCommands.get(commandName)

    }




    private async executeUnifiedCommand(command: SlashCommand, context: CommandContext): Promise<void> {

        const commandIdentifier = (CommandManager.isGlobalSlashCommand(command) || CommandManager.isGuildSlashCommand(command))
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
                   await command.execute(context)

                } catch (err) {

                    const error = err as Error
                    logger.warn(`{executeUnifiedCommand} Error in ${yellow(commandIdentifier)} (${context.isInteraction ? 'Interaction' : 'Message'}): ${red(error.message)}`)
                    if (error.message.toLowerCase().includes('unknown interaction') || error.message.toLowerCase().includes('unknown message')) {
                        logger.warn(`{executeUnifiedCommand} Discord API error, interaction/message may have timed out or been deleted.`)
                        return
                    }
                    // Re-throw to be caught by handleInteraction/handleMessageCommand's try-catch,
                    // which will then call this.handleError
                    throw error

                }
            }
        )

    }



    private buildYargsOptions(yargsInstance: Argv, options: Readonly<ExplicitAny[]>) {
        for (const option of options) {
            const opt = option as ExplicitAny
            const yargsOptConfig: YargsOptions = {
                describe: opt.description,
                // THIS IS KEY: yargs will use this to enforce required options
                required: opt.required || false,
                // Provide a requiredArg description for yargs' help output
                // Not a direct yargs property, but good to keep in mind if customizing help
            }

            // Add `requiredArg: opt.required` to help text for clarity if yargs shows it
            if (opt.required) {
                yargsOptConfig.describe = `(Required) ${opt.description}`
            }


            switch (opt.type) {
                case ApplicationCommandOptionType.String:
                    yargsOptConfig.type = 'string'
                    if (opt.choices) yargsOptConfig.choices = opt.choices.map((c: { name: string, value: string }) => c.value)
                    break
                case ApplicationCommandOptionType.Integer: // For integer, yargs handles parsing string to number.
                case ApplicationCommandOptionType.Number:
                    yargsOptConfig.type = 'number'
                    if (opt.type === ApplicationCommandOptionType.Integer) yargsOptConfig.coerce = (arg: ExplicitAny) => parseInt(arg,10)
                    if (opt.choices) yargsOptConfig.choices = opt.choices.map((c: { name: string, value: number }) => c.value)
                    break
                case ApplicationCommandOptionType.Boolean:
                    yargsOptConfig.type = 'boolean'
                    break
                case ApplicationCommandOptionType.User:
                case ApplicationCommandOptionType.Channel:
                case ApplicationCommandOptionType.Role:
                case ApplicationCommandOptionType.Mentionable:
                    yargsOptConfig.type = 'string' // Resolved later by CommandContext
                    break
                case ApplicationCommandOptionType.Attachment:
                    yargsOptConfig.type = 'boolean'
                    yargsOptConfig.default = false
                    yargsOptConfig.describe = `${opt.description} (Upload file with message when using this flag for text commands.)`
                    if (opt.required) yargsOptConfig.describe = `(Required) ${yargsOptConfig.describe}`
                    break
                default:
                    logger.warn(`{buildYargsOptions} Unsupported option type: ${opt.type} for ${opt.name}`)
                    yargsOptConfig.type = 'string'
            }
            yargsInstance.option(opt.name, yargsOptConfig)
        }
    }



    private buildYargsParserForCommand(commandDef: SlashCommand, message: Message): Argv<{}> {
        const baseCommandData = commandDef.data.toJSON()
        const messageArgs = message.content.slice(this.prefix.length).trim().split(/ +/).slice(1)
        const parser = yargs(messageArgs)

        parser
            .scriptName(`${this.prefix}${baseCommandData.name}`)
            .help("h").alias("h", "help")
            .version(false)
            .exitProcess(false) // Crucial
            .recommendCommands()
            .strict()
            .fail(async (msg, err, yargsInstanceItself) => { // Renamed for clarity
                let replyMessage = ''

                if (msg) { // yargs' primary message (e.g., "Missing argument: subcommand", "Invalid values:")
                    replyMessage = msg
                }

                if (err) { // An actual Error object from yargs
                    if (replyMessage) replyMessage += '\n'
                    replyMessage += `Error: ${err.message}` // Add the specific error message
                    logger.warn(`{buildYargsParserForCommand} Yargs internal error for ${baseCommandData.name}: ${err.message}`)
                }

                // If no specific message from yargs or error, try to generate help.
                // This path is less common if demandCommand or required options fail, as `msg` is usually set.
                if (!replyMessage) {
                    try {
                        // yargsInstanceItself is the yargs object. .getHelp() returns a Promise<string>.
                        replyMessage = await yargsInstanceItself.getHelp()
                    } catch (getHelpError) {
                        logger.error(`{buildYargsParserForCommand} Failed to generate help string: ${getHelpError}`)
                        replyMessage = "Invalid command usage. Could not generate help text." // Fallback
                    }
                } else {
                    // If we already have a message from yargs (msg or err.message),
                    // still try to append the full help text for better context.
                    try {
                        const fullHelp = await yargsInstanceItself.getHelp()
                        if (fullHelp && !replyMessage.includes(fullHelp.slice(0, Math.min(50, fullHelp.length)))) { // Avoid redundant appending
                            replyMessage += `\n\nUsage:\n${fullHelp}`
                        }
                    } catch (getHelpError) {
                        logger.warn(`{buildYargsParserForCommand} Could not append full yargs help output: ${getHelpError}`)
                    }
                }

                if (replyMessage.trim()) { // Only reply if there's something to say
                    await message.reply(replyMessage.trim())
                } else {
                    // This case should ideally not happen if yargs is failing.
                    logger.warn(`{buildYargsParserForCommand} Yargs .fail() called with no message and no error for ${baseCommandData.name}.`)
                    await message.reply("An unspecified error occurred with your command input.")
                }
                // After .fail, yargs().parseAsync() will throw, which is caught in handleMessageCommand.
            })

        const topLevelOptions = baseCommandData.options?.filter(
            (opt: ExplicitAny) => opt.type !== ApplicationCommandOptionType.Subcommand &&
                                  opt.type !== ApplicationCommandOptionType.SubcommandGroup
        ) || []

        // Define top-level options IF they exist
        if (topLevelOptions.length > 0) {
            this.buildYargsOptions(parser, topLevelOptions)
        }

        const subRelatedOptions = baseCommandData.options?.filter(
            (opt: ExplicitAny) => opt.type === ApplicationCommandOptionType.Subcommand ||
                                  opt.type === ApplicationCommandOptionType.SubcommandGroup
        ) || []

        let hasSubcommandsOrGroups = false
        if (subRelatedOptions.length > 0) {
            hasSubcommandsOrGroups = true
            for (const option of subRelatedOptions) {
                const optData = option as ExplicitAny
                if (optData.type === ApplicationCommandOptionType.Subcommand) {
                    parser.command(
                        optData.name,
                        optData.description,
                        (yargsSubcommand: Argv) => {
                            if (optData.options) this.buildYargsOptions(yargsSubcommand, optData.options)
                            return yargsSubcommand
                        },
                        async _argv => {}
                    )
                } else if (optData.type === ApplicationCommandOptionType.SubcommandGroup) {
                    parser.command(
                        optData.name,
                        optData.description,
                        (yargsGroup: Argv) => {
                            if (optData.options && Array.isArray(optData.options)) {
                                for (const subCmdOpt of optData.options) {
                                     if (subCmdOpt.type === ApplicationCommandOptionType.Subcommand) {
                                        yargsGroup.command(
                                            subCmdOpt.name, subCmdOpt.description,
                                            (yargsSubcommand: Argv) => {
                                                if (subCmdOpt.options) this.buildYargsOptions(yargsSubcommand, subCmdOpt.options)
                                                return yargsSubcommand
                                            },
                                            async _argv => {}
                                        )
                                    }
                                }
                            }
                            yargsGroup.demandCommand(1, `You need to specify a subcommand for '${optData.name}'.`)
                            return yargsGroup
                        },
                        async _argv => {}
                    )
                }
            }
        }

        // Demand a command (subcommand) IF the base command is purely a container for subcommands/groups
        // AND has no top-level options.
        if (hasSubcommandsOrGroups && topLevelOptions.length === 0) {
            parser.demandCommand(
                1, // require 1 command (subcommand)
                `This command requires a subcommand. Use --help for options.` // Message if none provided
            )
        }
        return parser
    }



    private handleError(e: Error, source: CommandInteraction | ContextMenuCommandInteraction | Message, cmdName?: string): void {

        const commandName = cmdName || ((source instanceof Message) ? source.content.split(' ')[0].slice(this.prefix.length) : (source as CommandInteraction).commandName)
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
        } else { // It's an Interaction
            // Try to reply or editReply based on interaction state
            if (!source.isRepliable()) {
                 logger.warn(`{handleError} Interaction for ${commandName} is not repliable.`)
                 return
            }

            if (source.deferred || source.replied) {
                source.editReply(replyMessage).catch(err =>
                    logger.warn(`{handleError} Could not editReply to interaction for ${commandName}: [${red(err.message)}]`)
                )
            } else {
                source.reply({ content: replyMessage, ephemeral: true }).catch(err =>
                    logger.warn(`{handleError} Could not reply to interaction for ${commandName}: [${red(err.message)}]`)
                )
            }
        }

    }



    private computeCommandHash(command: SlashCommand | ContextMenuCommand): string {

        const commandData = command.data.toJSON()

        const normalizedData = {
            name: commandData.name,
            options: commandData.options ? [...commandData.options].sort((a, b) => a.name.localeCompare(b.name)) : [],
            type: commandData.type,
            default_member_permissions: commandData.default_member_permissions,
            contexts: commandData.contexts
        }

        const hash = createHash('sha256')
        hash.update(JSON.stringify(normalizedData))
        return hash.digest('hex')

    }



    private async checkCommandChanges(commands: (SlashCommand | ContextMenuCommand)[], guildId?: string): Promise<boolean> {

        const remoteCommands = guildId
            ? await this.fetchGuildCommands(guildId)
            : await this.fetchGlobalCommands()

        if (remoteCommands.length !== commands.length) return true

        for (const command of commands) {

            const key = guildId ? `${guildId}:${command.data.name}` : command.data.name
            const currentHash = this.computeCommandHash(command)
            const previousHash = this.commandHashes.get(key)
            if (!previousHash || previousHash !== currentHash) {
                logger.info(`{checkCommandChanges} Command ${yellow(command.data.name)} has changed`)
                return true
            }

        }
        return false

    }



    public async refreshGlobalCommands() {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        logger.info('{refreshGlobalCommands} Checking for changes...')
        try {

            const commands = [
                ...this.globalCommands.values(),
                ...this.contextMenuCommands.values()
            ]

            const hasChanges = await this.checkCommandChanges(commands)
            if (!hasChanges) {
                logger.info('{refreshGlobalCommands} No changes detected, skipping refresh')
                return
            }

            logger.info('{refreshGlobalCommands} Changes detected, refreshing commands...')
            const commandData = commands.map(command => command.data.toJSON())

            await this.rest.put(
                Routes.applicationCommands(this.client.application!.id),
                { body: commandData }
            )

            // Update hashes after successful refresh
            for (const command of commands) {
                const key = command.data.name
                this.commandHashes.set(key, this.computeCommandHash(command))
            }

            logger.ok('{refreshGlobalCommands} Successfully refreshed commands')

        } catch (error) {
            logger.error(`{refreshGlobalCommands} Failed: ${red(error)}`)
            throw error
        }

    }



    public async refreshGuildCommands(guildId: string) {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        logger.info(`{refreshGuildCommands} Checking for changes in guild ${yellow(guildId)}...`)
        try {

            const guild = await this.client.guilds.fetch(guildId)
            if (!guild) {
                logger.error(`{refreshGuildCommands} Guild ${yellow(guildId)} not found!`)
                return
            }

            const guildCommands = this.guildCommands.get(guildId)
            if (!guildCommands) {
                logger.info(`{refreshGuildCommands} No commands found for guild ${yellow(guildId)}`)
                return
            }

            const commands = [...guildCommands.values()]
            const hasChanges = await this.checkCommandChanges(commands, guildId)
            if (!hasChanges) {
                logger.info(`{refreshGuildCommands} No changes detected for guild ${yellow(guildId)}, skipping refresh`)
                return
            }

            logger.info(`{refreshGuildCommands} Changes detected, refreshing commands for guild ${yellow(guildId)}...`)
            const commandData = commands.map(command => command.data.toJSON())

            await this.rest.put(
                Routes.applicationGuildCommands(this.client.application!.id, guildId),
                { body: commandData }
            )

            // Update hashes after successful refresh
            for (const command of commands) {
                const key = `${guildId}:${command.data.name}`
                this.commandHashes.set(key, this.computeCommandHash(command))
            }

            logger.ok(`{refreshGuildCommands} Successfully refreshed commands for guild ${yellow(guildId)}`)

        } catch (error) {
            logger.error(`{refreshGuildCommands} Failed for guild ${yellow(guildId)}: ${red(error)}`)
            throw error
        }

    }



    public async refreshAllGuildCommands() {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        const guilds = [...this.guildCommands.keys()]
        for (const guildId of guilds)
            await this.refreshGuildCommands(guildId)

    }



    public async fetchGlobalCommandIds(): Promise<{ id: string; name: string }[]> {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        try {
            const commands = await this.rest.get(
                Routes.applicationCommands(this.client.application!.id)
            ) as { id: string; name: string }[]
            return commands
        } catch (error) {
            logger.error(`{fetchGlobalCommandIds} Failed: ${red(error)}`)
            throw error
        }

    }



    public async fetchGlobalCommands(): Promise<(RESTPostAPIChatInputApplicationCommandsJSONBody | RESTPostAPIContextMenuApplicationCommandsJSONBody)[]> {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        try {
            const commands = await this.rest.get(
                Routes.applicationCommands(this.client.application!.id)
            ) as (RESTPostAPIChatInputApplicationCommandsJSONBody | RESTPostAPIContextMenuApplicationCommandsJSONBody)[]
            return commands
        } catch (error) {
            logger.error(`{fetchGlobalCommands} Failed: ${red(error)}`)
            throw error
        }

    }



    public async fetchGuildCommandIds(guildId: string): Promise<{ id: string; name: string }[]> {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        try {
            const commands = await this.rest.get(
                Routes.applicationGuildCommands(this.client.application!.id, guildId)
            ) as { id: string; name: string }[]
            return commands
        } catch (error) {
            logger.error(`{fetchGuildCommandIds} Failed for guild ${yellow(guildId)}: ${red(error)}`)
            throw error
        }

    }



    public async fetchGuildCommands(guildId: string): Promise<(RESTPostAPIChatInputApplicationCommandsJSONBody | RESTPostAPIContextMenuApplicationCommandsJSONBody)[]> {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        try {
            const commands = await this.rest.get(
                Routes.applicationGuildCommands(this.client.application!.id, guildId)
            ) as (RESTPostAPIChatInputApplicationCommandsJSONBody | RESTPostAPIContextMenuApplicationCommandsJSONBody)[]
            return commands
        } catch (error) {
            logger.error(`{fetchGuildCommands} Failed for guild ${yellow(guildId)}: ${red(error)}`)
            throw error
        }

    }



    public async deleteAllGlobalCommands(): Promise<void> {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        logger.info('{deleteAllGlobalCommands} Starting deletion of all global commands...')
        try {
            const commands = await this.fetchGlobalCommandIds()

            // Delete each command individually
            for (const command of commands) {
                logger.info(`{deleteAllGlobalCommands} Deleting command ${yellow(command.name)} (${yellow(command.id)})`)
                await this.rest.delete(
                    Routes.applicationCommand(this.client.application!.id, command.id)
                )
            }

            // Final cleanup with empty body
            logger.info('{deleteAllGlobalCommands} Performing final cleanup...')
            await this.rest.put(
                Routes.applicationCommands(this.client.application!.id),
                { body: [] }
            )

            logger.ok('{deleteAllGlobalCommands} Successfully deleted all global commands')
        } catch (error) {
            logger.error(`{deleteAllGlobalCommands} Failed: ${red(error)}`)
            throw error
        }

    }



    public async deleteAllGuildCommands(guildId: string): Promise<void> {

        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')
        if (!this.rest) throw new Error('REST client not initialized')

        logger.info(`{deleteAllGuildCommands} Starting deletion of all commands for guild ${yellow(guildId)}...`)
        try {
            const commands = await this.fetchGuildCommandIds(guildId)

            // Delete each command individually
            for (const command of commands) {
                logger.info(`{deleteAllGuildCommands} Deleting command ${yellow(command.name)} (${yellow(command.id)}) from guild ${yellow(guildId)}`)
                await this.rest.delete(
                    Routes.applicationGuildCommand(this.client.application!.id, guildId, command.id)
                )
            }

            // Final cleanup with empty body
            logger.info(`{deleteAllGuildCommands} Performing final cleanup for guild ${yellow(guildId)}...`)
            await this.rest.put(
                Routes.applicationGuildCommands(this.client.application!.id, guildId),
                { body: [] }
            )

            logger.ok(`{deleteAllGuildCommands} Successfully deleted all commands for guild ${yellow(guildId)}`)
        } catch (error) {
            logger.error(`{deleteAllGuildCommands} Failed for guild ${yellow(guildId)}: ${red(error)}`)
            throw error
        }

    }



    public static isSlashCommand = (obj: unknown): obj is SlashCommand => {
        return hasProp(obj, 'data') && (obj as ExplicitAny).data instanceof SlashCommandBuilder
    }

    public static isGuildSlashCommand = (obj: unknown): obj is GuildSlashCommand => {
        return (
            CommandManager.isSlashCommand(obj) &&
            'guildId' in obj &&
            typeof (obj as ExplicitAny).guildId === 'string'
        )
    }

    public static isGlobalSlashCommand = (obj: unknown): obj is SlashCommand => {
        return (
            CommandManager.isSlashCommand(obj) &&
            !('guildId' in obj)
        )
    }

    public static isContextMenuCommand = (obj: unknown): obj is ContextMenuCommand => {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'data' in obj &&
            'type' in obj &&
            (obj as ExplicitAny).data instanceof ContextMenuCommandBuilder &&
            ((obj as ExplicitAny).type === 2 || (obj as ExplicitAny).type === 3)
        )
    }
}
