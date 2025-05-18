const esmodules = !!import.meta.url

import { Logger, yellow, red } from '../util/logger'
const logger = new Logger('CommandManager')

import {
    SlashCommandBuilder, ContextMenuCommandBuilder, Client, CommandInteraction,
    type RESTPostAPIChatInputApplicationCommandsJSONBody, REST,
    type RESTPostAPIContextMenuApplicationCommandsJSONBody,
    Routes, ContextMenuCommandInteraction, MessageContextMenuCommandInteraction,
    UserContextMenuCommandInteraction, Message, Guild, Attachment,
    ApplicationCommandOptionType, ChatInputCommandInteraction, User,
    Role, type GuildBasedChannel, GuildMember, type MessageReplyOptions,
    type InteractionReplyOptions, type MessageEditOptions, type InteractionEditReplyOptions,
    InteractionResponse, type InteractionDeferReplyOptions, PermissionsBitField,
    type TextBasedChannel, type ImageSize, type ImageExtension
} from 'discord.js'

import { readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getUserAvatar, guildMember, hasProp } from '../util/functions'
import { operationTracker } from './OperationTracker'

import { createHash } from 'crypto'

import {
    SlashCommand, GuildSlashCommand, ContextMenuCommand,
    ClassNotInitializedError, MissingPermissionsError,
    type ExplicitAny, type GuildId,
    type JSONResolvable,
    type OldSlashCommandHelpers
} from '../types/types'
import { EMBERGLAZE_ID, PING_EMBERGLAZE, TYPING_EMOJI } from '../util/constants'
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
            return
        }

        const context = new CommandContext(message, commandParts)
        try {
            let argsOnlyString = ''
            const firstSpaceIndex = contentWithoutPrefix.indexOf(' ')
            if (firstSpaceIndex !== -1) {
                argsOnlyString = contentWithoutPrefix.substring(firstSpaceIndex + 1).trimStart()
            }

            const yargsParser = this.buildYargsParserForCommand(command as SlashCommand, message, argsOnlyString)
            const parsedYargsArgs = await yargsParser.parseAsync()

            // Check if help was explicitly requested.
            // .help("h").alias("h", "help") means yargs will populate 'h' in argv if help was triggered.
            // When .help() is triggered and exitProcess(false) is set, yargs doesn't run command handlers
            // and doesn't call .fail(). It just shows help (by default to console) and parseAsync() resolves.
            if (hasProp(parsedYargsArgs, 'h') && parsedYargsArgs.h === true) {

                logger.info(`{handleMessageCommand} Help flag detected for command: ${commandName}`)
                logger.info(`{handleMessageCommand} Raw args string passed to yargs: "${argsOnlyString}"`)
                logger.info(`{handleMessageCommand} Parsed yargs argv: ${JSON.stringify(parsedYargsArgs)}`)
                logger.info(`{handleMessageCommand} Type of yargsParser: ${typeof yargsParser}`)
                if (yargsParser && typeof yargsParser === 'object') {
                    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(yargsParser)).filter(prop => typeof (yargsParser as ExplicitAny)[prop] === 'function')
                    logger.info(`{handleMessageCommand} yargsParser methods: ${methods.join(', ')}`)
                }

                const helpText = await yargsParser.getHelp() // This is the crucial call

                // Log the help text before sending
                logger.info(`{handleMessageCommand} Help text generated by yargsParser.getHelp():\n${helpText}`)

                await message.reply(`\`\`\`\n${helpText}\n\`\`\``)
                return
            }

            // If parseAsync completed without throwing, and help was not explicitly requested,
            // it means validation (including demandCommand) passed.
            const yargsCommandPath = parsedYargsArgs._.map(String)
            const commandDataJson = command.data.toJSON()

            // Use a default empty array for options to avoid undefined errors
            const options = commandDataJson.options ?? []

            // Populate subcommandName and subcommandGroupName from yargs parsed path
            const commandPathForContext = [...yargsCommandPath]

            if (options.some(o => o.type === ApplicationCommandOptionType.SubcommandGroup)) {
                const potentialGroup = commandPathForContext[0]
                if (potentialGroup && options.find(o => o.name === potentialGroup && o.type === ApplicationCommandOptionType.SubcommandGroup)) {
                    context.subcommandGroupName = commandPathForContext.shift() || null
                }
            }
            if (
                options.some(o => o.type === ApplicationCommandOptionType.Subcommand) ||
                (() => {
                    const group = context.subcommandGroupName && options.find(
                        o =>
                            o.name === context.subcommandGroupName &&
                            o.type === ApplicationCommandOptionType.SubcommandGroup &&
                            Array.isArray((o as ExplicitAny).options)
                    )
                    return !!(group && Array.isArray((group as ExplicitAny).options) &&
                        (group as ExplicitAny).options.some((subOpt: ExplicitAny) => subOpt.type === ApplicationCommandOptionType.Subcommand)
                    )
                })()
            ) {
                const potentialSubcommand = commandPathForContext[0]
                if (potentialSubcommand) {
                    let subOptExists = false
                    if (context.subcommandGroupName) {
                        const group = options.find(
                            o =>
                                o.name === context.subcommandGroupName &&
                                o.type === ApplicationCommandOptionType.SubcommandGroup &&
                                Array.isArray((o as ExplicitAny).options)
                        )
                        subOptExists = !!(group && (group as ExplicitAny).options?.find((subOpt: ExplicitAny) => subOpt.name === potentialSubcommand && subOpt.type === ApplicationCommandOptionType.Subcommand))
                    } else {
                        subOptExists = !!options.find(o => o.name === potentialSubcommand && o.type === ApplicationCommandOptionType.Subcommand)
                    }
                    if (subOptExists) {
                        context.subcommandName = commandPathForContext.shift() || null
                    }
                }
            }
            context.parsedArgs = parsedYargsArgs as ArgumentsCamelCase<{ [key: string]: JSONResolvable }>

            await this.executeUnifiedCommand(command as SlashCommand, context)

        } catch (e) {
            const error = e as Error & { name?: string }
            if (error.name === 'YError') {
                logger.warn(`{handleMessageCommand} Yargs validation error for "${commandName}" (name: YError). .fail() should have replied.`)
            } else {
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



    private buildYargsParserForCommand(commandDef: SlashCommand, message: Message, rawArgsString: string): Argv<{}> {
        const baseCommandData = commandDef.data.toJSON()
        const parser = yargs(rawArgsString)

        parser
            .scriptName(`${this.prefix}${baseCommandData.name}`)
            .help('h').alias('h', 'help')
            .version(false)
            .exitProcess(false) // Crucial
            .recommendCommands()
            .strict()
            .fail(async (msg, err, yargsInstanceItself) => { // Renamed for clarity
                logger.info(`{buildYargsParserForCommand.fail} Type of yargsInstanceItself: ${typeof yargsInstanceItself}`)
                if (yargsInstanceItself && typeof yargsInstanceItself === 'object') {
                    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(yargsInstanceItself)).filter(prop => typeof (yargsInstanceItself as ExplicitAny)[prop] === 'function')
                    logger.info(`{buildYargsParserForCommand.fail} yargsInstanceItself methods: ${methods.join(', ')}`)
                }
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
                        if (yargsInstanceItself && typeof yargsInstanceItself.getHelp === 'function') { // Check if getHelp exists
                            replyMessage = await yargsInstanceItself.getHelp()
                        } else {
                            logger.warn(`{buildYargsParserForCommand.fail} yargsInstanceItself.getHelp is not a function for ${baseCommandData.name}. Falling back. Msg: "${msg}", Err: "${err ? err.message : 'N/A'}"`)
                            replyMessage = msg || (err ? `Error: ${err.message}` : 'Invalid command usage. Use --help for more info.')
                        }
                    } catch (getHelpError) {
                        logger.error(`{buildYargsParserForCommand} Failed to generate help string: ${getHelpError}`)
                        replyMessage = 'Invalid command usage. Could not generate help text.'
                    }
                } else {
                    try {
                        // Check if getHelp exists before calling
                        if (yargsInstanceItself && typeof yargsInstanceItself.getHelp === 'function') {
                            const fullHelp = await yargsInstanceItself.getHelp()
                            if (fullHelp && !replyMessage.includes(fullHelp.slice(0, Math.min(50, fullHelp.length)))) {
                                replyMessage += `\n\nUsage:\n${fullHelp}`
                            }
                        } else {
                             logger.warn(`{buildYargsParserForCommand} yargsInstanceItself.getHelp is not a function (in else branch) for ${baseCommandData.name}. Cannot append full help.`)
                        }
                    } catch (getHelpError) {
                        logger.warn(`{buildYargsParserForCommand} Could not append full yargs help output: ${getHelpError}`)
                    }
                }

                if (replyMessage.trim()) { // Only reply if there's something to say
                    // Format as code block for better readability, especially for multi-line help/error messages
                    const formattedReply = `\`\`\`\n${replyMessage.trim()}\n\`\`\``
                    await message.reply(formattedReply)
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


export class CommandContext {
    public readonly client: Client
    public readonly interaction: ChatInputCommandInteraction | null
    public readonly message: Message | null
    public originalMessageReply: Message | null = null
    public readonly args: string[] // for text commands
    public readonly myId: typeof EMBERGLAZE_ID = EMBERGLAZE_ID
    public readonly pingMe: typeof PING_EMBERGLAZE = PING_EMBERGLAZE
    public parsedArgs: ArgumentsCamelCase<{ [key: string]: JSONResolvable }> | null = null
    public subcommandName: string | null = null
    public subcommandGroupName: string | null = null


    constructor(source: ChatInputCommandInteraction | Message, rawArgs?: string[]) {
        this.client = source.client
        if (source instanceof Message) {
            this.message = source
            this.interaction = null
            this.args = rawArgs || []
        } else {
            this.interaction = source as ChatInputCommandInteraction
            this.message = null
            this.args = []
            if (this.interaction.options) {
                try {
                    this.subcommandGroupName = this.interaction.options.getSubcommandGroup(false)
                } catch { this.subcommandGroupName = null }
                 try {
                    this.subcommandName = this.interaction.options.getSubcommand(false)
                } catch { this.subcommandName = null }
            }
        }
    }



    get isInteraction(): boolean { return this.interaction !== null }
    get isMessage(): boolean { return this.message !== null }
    get author(): User { return this.interaction ? this.interaction.user : this.message!.author }
    get user(): User { return this.author }

    get member(): GuildMember | null {
        if (this.interaction) {
            return guildMember(this.interaction.member)
        }
        return this.message!.member
    }

    get guild(): Guild | null { return this.interaction ? this.interaction.guild : this.message!.guild }
    get channel(): TextBasedChannel | null { return this.interaction ? this.interaction.channel : this.message!.channel }

    get memberPermissions(): Readonly<PermissionsBitField> | null {
        if (this.interaction?.memberPermissions) return this.interaction.memberPermissions
        if (this.message?.member?.permissions) return this.message.member.permissions
        return null
    }



    async reply(options: string | InteractionReplyOptions | MessageReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction) {
            if (this.interaction.isRepliable() && !this.interaction.replied && !this.interaction.deferred) {
                return this.interaction.reply(options as string | InteractionReplyOptions)
            } else if (this.interaction.isRepliable()) {
                return this.interaction.followUp(options as string | InteractionReplyOptions)
            }
        } else if (this.message) {
            this.originalMessageReply = await this.message.reply(options as string | MessageReplyOptions)
            return this.originalMessageReply
        }
    }
    async deferReply(options?: InteractionDeferReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction && this.interaction.isRepliable() && !this.interaction.deferred) {
            return this.interaction.deferReply(options)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function') {
                this.originalMessageReply = await channel.send(`${TYPING_EMOJI} ${this.client.user!.displayName} is thinking...`)
                return this.originalMessageReply
            }
        }
    }
    async editReply(options: string | InteractionEditReplyOptions | MessageEditOptions): Promise<Message | void> {
        if (this.interaction && this.interaction.isRepliable()) {
            return this.interaction.editReply(options as string | InteractionEditReplyOptions)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function' && this.originalMessageReply) {
                // If editing with only embeds and no content, erase the message content (like interaction replies)
                if (
                    typeof options === 'object' &&
                    options !== null &&
                    'embeds' in options &&
                    Array.isArray(options.embeds) &&
                    options.embeds.length > 0 &&
                    !('content' in options)
                ) {
                    (options as MessageEditOptions).content = ''
                }
                return this.originalMessageReply.edit(options as string | MessageEditOptions)
            }
        }
    }
    async followUp(options: string | InteractionReplyOptions): Promise<Message | void> {
        if (this.interaction && this.interaction.isRepliable()) {
            return this.interaction.followUp(options)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function' && this.originalMessageReply) {
                return this.originalMessageReply.reply(options as string | MessageReplyOptions)
            }
        }
    }



    private async resolveUser(idOrMention: string): Promise<User | null> {
        if (!idOrMention) return null
        const match = idOrMention.match(/^<@!?(\d+)>$/)
        const id = match ? match[1] : idOrMention
        try {
            return await this.client.users.fetch(id)
        } catch {
            return null
        }
    }

    private async resolveMember(idOrMention: string): Promise<GuildMember | null> {
        if (!idOrMention || !this.guild) return null
        const user = await this.resolveUser(idOrMention)
        if (!user) return null
        try {
            return await this.guild.members.fetch(user.id)
        } catch {
            return null
        }
    }

    private async resolveChannel(idOrNameOrMention: string): Promise<GuildBasedChannel | null> {
        if (!idOrNameOrMention || !this.guild) return null
        const mentionMatch = idOrNameOrMention.match(/^<#(\d+)>$/)
        const id = mentionMatch ? mentionMatch[1] : idOrNameOrMention

        try {
            const channel = await this.client.channels.fetch(id)
            if (channel && 'guildId' in channel && channel.guildId === this.guild.id) return channel
        } catch { /* ignore error, try by name */ }

        // Try by name (case-insensitive)
        const channelByName = this.guild.channels.cache.find(
            ch => ch.name.toLowerCase() === idOrNameOrMention.toLowerCase()
        )
        return channelByName || null
    }

    private async resolveRole(idOrNameOrMention: string): Promise<Role | null> {
        if (!idOrNameOrMention || !this.guild) return null
        const mentionMatch = idOrNameOrMention.match(/^<@&(\d+)>$/)
        const id = mentionMatch ? mentionMatch[1] : idOrNameOrMention

        try {
            const role = await this.guild.roles.fetch(id)
            if (role) return role
        } catch { /* ignore error, try by name */ }

        const roleByName = this.guild.roles.cache.find(
            r => r.name.toLowerCase() === idOrNameOrMention.toLowerCase()
        )
        return roleByName || null
    }

    private getScopedInteractionOptions() {
        return this.interaction ? this.interaction.options : null
    }


    async getStringOption(name: string, required: true): Promise<string>
    async getStringOption(name: string, required?: false): Promise<string | null>
    async getStringOption(name: string): Promise<string | null> // required is implicitly false
    async getStringOption(name: string, required?: boolean): Promise<string | null> {
        let value: string | null = null
        if (this.interaction) {
            value = this.interaction.options.getString(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = parsedValue !== undefined && parsedValue !== null ? String(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getIntegerOption(name: string, required: true): Promise<number>
    async getIntegerOption(name: string, required?: false): Promise<number | null>
    async getIntegerOption(name: string): Promise<number | null>
    async getIntegerOption(name: string, required?: boolean): Promise<number | null> {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getInteger(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = Number.isInteger(parsedValue) ? Number(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getBooleanOption(name: string, required: true): Promise<boolean>
    async getBooleanOption(name: string, required?: false): Promise<boolean | null> // Note: boolean can be false, so null means "not provided"
    async getBooleanOption(name: string): Promise<boolean | null>
    async getBooleanOption(name: string, required?: boolean): Promise<boolean | null> {
        let value: boolean | null = null
        if (this.interaction) {
            value = this.interaction.options.getBoolean(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            // For yargs, a boolean flag not present might be undefined. If present, it's true/false.
            value = typeof parsedValue === 'boolean' ? parsedValue : null
        }

        if (required && value === null) { // For booleans, null means "not provided"
            throw new Error(`Required option "${name}" is missing for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getUserOption(name: string, required: true): Promise<User>
    async getUserOption(name: string, required?: false): Promise<User | null>
    async getUserOption(name: string): Promise<User | null>
    async getUserOption(name: string, required?: boolean): Promise<User | null> {
        let value: User | null = null
        if (this.interaction) {
            value = this.interaction.options.getUser(name, required || false)
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveUser(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getMemberOption(name: string, required: true): Promise<GuildMember>
    async getMemberOption(name: string, required?: false): Promise<GuildMember | null>
    async getMemberOption(name: string): Promise<GuildMember | null>
    async getMemberOption(name: string, required?: boolean): Promise<GuildMember | null> {
        let member: GuildMember | null = null
        if (this.interaction) {
            member = guildMember(this.interaction.options.getMember(name))
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            member = parsedVal ? await this.resolveMember(parsedVal) : null
        }

        if (required && member === null) {
            throw new Error(`Required member option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return member
    }

    async getChannelOption(name: string, required: true): Promise<GuildBasedChannel>
    async getChannelOption(name: string, required?: false): Promise<GuildBasedChannel | null>
    async getChannelOption(name: string): Promise<GuildBasedChannel | null>
    async getChannelOption(name: string, required?: boolean): Promise<GuildBasedChannel | null> {
        let value: GuildBasedChannel | null = null
        if (this.interaction) {
            value = this.interaction.options.getChannel(name, required || false) as GuildBasedChannel | null
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveChannel(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getRoleOption(name: string, required: true): Promise<Role>
    async getRoleOption(name: string, required?: false): Promise<Role | null>
    async getRoleOption(name: string): Promise<Role | null>
    async getRoleOption(name: string, required?: boolean): Promise<Role | null> {
        let value: Role | null = null
        if (this.interaction) {
            value = this.interaction.options.getRole(name, required || false) as Role | null
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveRole(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getNumberOption(name: string, required: true): Promise<number>
    async getNumberOption(name: string, required?: false): Promise<number | null>
    async getNumberOption(name: string): Promise<number | null>
    async getNumberOption(name: string, required?: boolean): Promise<number | null> {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getNumber(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = typeof parsedValue === 'number' ? parsedValue : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getAttachmentOption(name: string, required: true): Promise<Attachment>
    async getAttachmentOption(name: string, required?: false): Promise<Attachment | null>
    async getAttachmentOption(name: string): Promise<Attachment | null>
    async getAttachmentOption(name: string, required?: boolean): Promise<Attachment | null> {
        let value: Attachment | null = null
        if (this.interaction) {
            value = this.interaction.options.getAttachment(name, required || false)
        } else if (this.message && this.parsedArgs) {
            const attachmentFlagPresent = this.parsedArgs[name] === true || typeof this.parsedArgs[name] === 'string'
            if (attachmentFlagPresent && this.message.attachments.size > 0) {
                value = this.message.attachments.first()! // Non-null assertion as size > 0
            }
        }

        if (required && value === null) {
            throw new Error(`Required attachment "${name}" is missing or was not provided correctly for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    public getSubcommand(required?: false): string | null;
    public getSubcommand(required: true): string;
    public getSubcommand(required?: boolean): string | null {
        if (required && !this.subcommandName) {
            throw new Error('A subcommand was required but not provided or identified.')
        }
        return this.subcommandName
    }

    public getSubcommandGroup(required?: false): string | null;
    public getSubcommandGroup(required: true): string;
    public getSubcommandGroup(required?: boolean): string | null {
        if (required && !this.subcommandGroupName) {
            throw new Error('A subcommand group was required but not provided or identified.')
        }
        return this.subcommandGroupName
    }



    // getUserAvatar needs to be adapted or the CommandContext needs to provide user/guild
    public getUserAvatar(user: User, guild?: Guild | null, options?: { extension?: ImageExtension, size?: ImageSize, useGlobalAvatar?: boolean }): string {
        return getUserAvatar(user, guild || this.guild, options)
    }
}
