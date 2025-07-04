import { Logger, yellow, red } from '../util/logger'
const logger = new Logger('CommandManager')

import {
    SlashCommandBuilder, ContextMenuCommandBuilder,
    Routes, Message, ApplicationCommandOptionType,
    REST, InteractionResponse, ApplicationCommandType,
    MessageFlags, ChannelType, DiscordAPIError,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder
} from 'discord.js'
import type {
    RESTPostAPIChatInputApplicationCommandsJSONBody, Role,
    RESTPostAPIContextMenuApplicationCommandsJSONBody,
    InteractionEditReplyOptions, ImageExtension, User,
    ImageSize, TextBasedChannel, MessageReplyOptions, GuildMember,
    InteractionReplyOptions, InteractionDeferReplyOptions,
    GuildBasedChannel, MessageEditOptions, Client, CommandInteraction,
    ContextMenuCommandInteraction, MessageContextMenuCommandInteraction,
    UserContextMenuCommandInteraction, Guild, Attachment,
    PermissionsBitField, ChatInputCommandInteraction,
    APIApplicationCommandOption,
} from 'discord.js'

import { readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { getUserAvatar, guildMember, hasProp } from '../util/functions'
import { operationTracker } from './OperationTracker'

import { ClassNotInitializedError, MissingPermissionsError, BotInstallationType } from '../types'
import type {
    SlashCommand, GuildSlashCommand, ContextMenuCommand,
    ExplicitAny, GuildId, JSONResolvable,
    OldSlashCommandHelpers, GuildOnlyCommandContext
} from '../types'

import { EMBI_ID, PING_EMBI, TYPING_EMOJI } from '../util/constants'
import type { ArgumentsCamelCase, Argv, Options as YargsOptions } from 'yargs'
import yargs from 'yargs'

type CommandBuilderWithOptions = SlashCommandBuilder | SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder

export default class CommandManager {

    private static instance: CommandManager

    private currentDir = ''
    private globalCommands: Map<string, SlashCommand> = new Map()
    private guildCommands: Map<GuildId, Map<string, GuildSlashCommand>> = new Map()
    private contextMenuCommands: Map<string, ContextMenuCommand> = new Map()
    private initialized = false
    private client: Client | null = null
    private rest: REST | null = null

    private constructor() {}

    public static getInstance(): CommandManager {
        if (!CommandManager.instance) {
            CommandManager.instance = new CommandManager()
        }
        return CommandManager.instance
    }

    public setClient(client: Client): CommandManager {
        this.client = client
        this.rest = new REST().setToken(client.token!)
        return this
    }

    public async init() {

        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{init} Initializing...')
        const initStartTime = process.hrtime.bigint()

        this.currentDir = path.dirname(fileURLToPath(import.meta.url))
        await this.loadCommands(path.join(this.currentDir, '../commands'))

        this.initialized = true

        const initEndTime = process.hrtime.bigint()
        const totalTime = Number(initEndTime - initStartTime) / 1_000_000_000
        logger.ok(`{init} Total time: ${yellow(totalTime)}s`)

    }

    /**
     * Recursively clones and reconstructs a Discord.js CommandBuilder (Slash or Context Menu)
     * from its JSON representation. This is necessary because `structuredClone`
     * does not preserve class instances or their methods.
     * @param originalBuilder The original CommandBuilder instance.
     * @param newName Optional new name to set for the cloned builder.
     * @returns A new CommandBuilder instance with the copied properties.
     */
    public cloneCommandBuilder<T extends SlashCommandBuilder | ContextMenuCommandBuilder>(
        originalBuilder: T,
        newName?: string
    ): T {
        const originalJson = originalBuilder.toJSON()

        if (originalBuilder instanceof SlashCommandBuilder && 'description' in originalJson) {
            const newBuilder = new SlashCommandBuilder()

            // Copy base properties
            if (originalJson.description) newBuilder.setDescription(originalJson.description)
            if (originalJson.contexts !== undefined && Array.isArray(originalJson.contexts)) {
                newBuilder.setContexts(originalJson.contexts)
            }
            if (originalJson.nsfw !== undefined) newBuilder.setNSFW(originalJson.nsfw)
            if (originalJson.default_member_permissions) {
                newBuilder.setDefaultMemberPermissions(originalJson.default_member_permissions)
            }

            // Recursively add all options
            if (originalJson.options) {
                for (const option of originalJson.options) {
                    this.addOptionToBuilder(newBuilder, option)
                }
            }

            newBuilder.setName(newName ?? originalJson.name)
            return newBuilder as T

        } else if (originalBuilder instanceof ContextMenuCommandBuilder) {
            const newBuilder = new ContextMenuCommandBuilder()
            // Context menu commands have fewer configurable properties
            if (originalJson.type === ApplicationCommandType.Message || originalJson.type === ApplicationCommandType.User) {
                newBuilder.setType(originalJson.type)
            }
            if (originalJson.contexts !== undefined && Array.isArray(originalJson.contexts)) {
                newBuilder.setContexts(originalJson.contexts)
            }
            if (originalJson.default_member_permissions) {
                newBuilder.setDefaultMemberPermissions(originalJson.default_member_permissions)
            }

            newBuilder.setName(newName ?? originalJson.name)
            return newBuilder as T
        }

        // Fallback for safety, though this path should not be reachable with the generic constraint.
        throw new Error('Unsupported builder type provided.')
    }

    /**
     * A private helper to recursively add an option from its JSON representation
     * to a given builder, respecting the nesting rules of the Discord API.
     * @param builder The builder to add the option to.
     * @param option The JSON representation of the option to add.
     */
    private addOptionToBuilder(builder: CommandBuilderWithOptions, option: APIApplicationCommandOption): void {
        // --- Structural Options ---
        // These options contain other options and have strict placement rules.

        if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
            // Type guard: Only SlashCommandBuilder can have subcommand groups.
            if (builder instanceof SlashCommandBuilder) {
                builder.addSubcommandGroup(group => {
                    group.setName(option.name).setDescription(option.description)
                    if (option.options) {
                        for (const subCommand of option.options) {
                            this.addOptionToBuilder(group, subCommand)
                        }
                    }
                    return group
                })
            }
            return // Handled
        }

        if (option.type === ApplicationCommandOptionType.Subcommand) {
            // Type guard: Subcommands can be in a SlashCommandBuilder or a SubcommandGroupBuilder.
            if (builder instanceof SlashCommandBuilder || builder instanceof SlashCommandSubcommandGroupBuilder) {
                builder.addSubcommand(sub => {
                    sub.setName(option.name).setDescription(option.description)
                    if (option.options) {
                        for (const subOption of option.options) {
                            this.addOptionToBuilder(sub, subOption)
                        }
                    }
                    return sub
                })
            }
            return // Handled
        }

        // --- Basic Options ---
        // At this point, `option` is a basic type (String, Integer, etc.).
        // These can only be added to a SlashCommandBuilder or a SlashCommandSubcommandBuilder.
        if (!(builder instanceof SlashCommandBuilder || builder instanceof SlashCommandSubcommandBuilder)) {
            return
        }

        switch (option.type) {
            case ApplicationCommandOptionType.String:
                builder.addStringOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(!!option.required)
                    if (option.choices) opt.addChoices(...option.choices)
                    if (option.min_length !== undefined) opt.setMinLength(option.min_length)
                    if (option.max_length !== undefined) opt.setMaxLength(option.max_length)
                    if (option.autocomplete !== undefined) opt.setAutocomplete(option.autocomplete)
                    return opt
                })
                break
            case ApplicationCommandOptionType.Integer:
                builder.addIntegerOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(!!option.required)
                    if (option.choices) opt.addChoices(...option.choices)
                    if (option.min_value !== undefined) opt.setMinValue(option.min_value)
                    if (option.max_value !== undefined) opt.setMaxValue(option.max_value)
                    if (option.autocomplete !== undefined) opt.setAutocomplete(option.autocomplete)
                    return opt
                })
                break
            case ApplicationCommandOptionType.Number:
                builder.addNumberOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(!!option.required)
                    if (option.choices) opt.addChoices(...option.choices)
                    if (option.min_value !== undefined) opt.setMinValue(option.min_value)
                    if (option.max_value !== undefined) opt.setMaxValue(option.max_value)
                    if (option.autocomplete !== undefined) opt.setAutocomplete(option.autocomplete)
                    return opt
                })
                break
            case ApplicationCommandOptionType.Channel:
                builder.addChannelOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(!!option.required)
                    // Note: some weird type mismatch for `ChannelType.GuildDirectory`,
                    // ignore it for now since it's too obscure for me to care :3
                    if (option.channel_types) opt.addChannelTypes(...option.channel_types.filter(channelType => channelType !== ChannelType.GuildDirectory))
                    return opt
                })
                break
            case ApplicationCommandOptionType.Boolean:
                builder.addBooleanOption(opt => opt.setName(option.name).setDescription(option.description).setRequired(!!option.required))
                break
            case ApplicationCommandOptionType.User:
                builder.addUserOption(opt => opt.setName(option.name).setDescription(option.description).setRequired(!!option.required))
                break
            case ApplicationCommandOptionType.Role:
                builder.addRoleOption(opt => opt.setName(option.name).setDescription(option.description).setRequired(!!option.required))
                break
            case ApplicationCommandOptionType.Mentionable:
                builder.addMentionableOption(opt => opt.setName(option.name).setDescription(option.description).setRequired(!!option.required))
                break
            case ApplicationCommandOptionType.Attachment:
                builder.addAttachmentOption(opt => opt.setName(option.name).setDescription(option.description).setRequired(!!option.required))
                break
        }
    }

    private async importCommand(file: Dirent) {

        const startTime = Date.now()
        try {

            const importedModule = await import(path.join(this.currentDir, `../commands/${file.name}`))
            const commands: (SlashCommand | ContextMenuCommand)[] = []
            const commandInfo: { name: string, type: string, guildId?: GuildId, aliases?: string[] }[] = []

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
                    commandInfo.push({ name: command.data.name, type: 'guild slash', guildId: command.guildId, aliases: command.aliases })

                } else if (CommandManager.isGlobalSlashCommand(command)) {

                    this.globalCommands.set(command.data.name, command)
                    commands.push(command)
                    commandInfo.push({ name: command.data.name, type: 'global slash/text', aliases: command.aliases })

                }

                if (CommandManager.isSlashCommand(command) && command.aliases && command.aliases.length > 0) {

                    for (const alias of command.aliases) {

                        // Shallow-copy the command object
                        const commandCopy: SlashCommand = {
                            ...command,
                            aliases: undefined, // no longer a nuke hazard :3
                            ...(CommandManager.isGuildSlashCommand(command) ? { guildId: command.guildId } : {})
                        }

                        // SlashCommandBuilder instance cannot be shallow-copied
                        commandCopy.data = this.cloneCommandBuilder(command.data as SlashCommandBuilder, alias) as SlashCommandBuilder

                        this.globalCommands.set(alias, commandCopy)
                        commands.push(commandCopy)
                        commandInfo.push({ name: alias, type: 'global slash/text', aliases: undefined })

                    }

                }
            }

            if (commands.length === 0) {
                return { file: file.name, commands: [], time: Date.now() - startTime }
            }

            return { file: file.name, commands: commandInfo, time: Date.now() - startTime }

        } catch (err) {
            logger.warn(`{importCommand} Error importing commands from ${yellow(file.name)}: ${err}`)
            return { file: file.name, commands: [], time: Date.now() - startTime, error: err }
        }

    }



    private async loadCommands(dir: string) {

        logger.info(`{loadCommands} Reading commands from ${yellow(dir)}...`)
        const files = await readdir(dir, { withFileTypes: true })
        logger.ok(`{loadCommands} Found ${yellow(files.length)} files in ${yellow(dir)}`)

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
                const context = new CommandContext(interaction)
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
        if (!this.initialized || !message.content.startsWith(prefix) || message.author.bot) return

        const { commandName, rawArgsString } = this._parseCommandFromMessage(message.content, prefix)
        if (!commandName) return

        const command = this.findMatchingSlashCommand(commandName, message.guildId)

        if (!command || !CommandManager.isSlashCommand(command)) {
            return
        }

        try {
            const context = await this._createContextForMessageCommand(message, command, rawArgsString, prefix)

            // Handle explicit help request before executing
            if (context.parsedArgs?.h === true || context.parsedArgs?.help === true) {
                const finalArgsString = this._reconstructArgumentsForYargs(rawArgsString, command)
                const yargsParser = this.buildYargsParserForCommand(command, message, finalArgsString, prefix)
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

    private _parseCommandFromMessage(content: string, prefix: string): { commandName: string | null; rawArgsString: string } {
        const contentWithoutPrefix = content.slice(prefix.length).trim()
        const commandName = contentWithoutPrefix.split(/ +/)[0]?.toLowerCase() ?? null
        const firstSpaceIndex = contentWithoutPrefix.indexOf(' ')
        const rawArgsString = firstSpaceIndex !== -1 ? contentWithoutPrefix.substring(firstSpaceIndex + 1).trimStart() : ''
        return { commandName, rawArgsString }
    }

    private async _createContextForMessageCommand(message: Message, command: SlashCommand, rawArgsString: string, prefix: string): Promise<CommandContext> {
        const finalArgsString = this._reconstructArgumentsForYargs(rawArgsString, command)
        const yargsParser = this.buildYargsParserForCommand(command, message, finalArgsString, prefix)

        const parsedYargsArgs = await yargsParser.parseAsync()

        const context = new CommandContext(message, rawArgsString.split(/ +/))
        context.parsedArgs = parsedYargsArgs as ArgumentsCamelCase<{ [key: string]: JSONResolvable }>

        this._setSubcommandContextFromArgs(context, parsedYargsArgs, command.data.toJSON())

        return context
    }

    private _reconstructArgumentsForYargs(rawArgsString: string, command: SlashCommand): string {
        const commandData = command.data.toJSON()
        const allTokens = this.tokenizeArgs(rawArgsString)

        const commandPath: string[] = []
        let activeOptions = commandData.options ?? []
        let argsStartIndex = 0

        if (allTokens.length > 0) {
            let currentLevelOptions = commandData.options ?? []
            const groupDef = currentLevelOptions.find(o => o.name === allTokens[0] && o.type === ApplicationCommandOptionType.SubcommandGroup)
            if (groupDef) {
                commandPath.push(allTokens[0])
                argsStartIndex = 1
                currentLevelOptions = (groupDef as ExplicitAny).options ?? []
                if (allTokens.length > 1) {
                    const subDef = currentLevelOptions.find(o => o.name === allTokens[1] && o.type === ApplicationCommandOptionType.Subcommand)
                    if (subDef) {
                        commandPath.push(allTokens[1])
                        argsStartIndex = 2
                        activeOptions = (subDef as ExplicitAny).options ?? []
                    }
                }
            } else {
                const subDef = currentLevelOptions.find(o => o.name === allTokens[0] && o.type === ApplicationCommandOptionType.Subcommand)
                if (subDef) {
                    commandPath.push(allTokens[0])
                    argsStartIndex = 1
                    activeOptions = (subDef as ExplicitAny).options ?? []
                }
            }
        }

        const argTokens = allTokens.slice(argsStartIndex)
        const requiredOptions = activeOptions.filter(opt => opt.required)

        const positionalValues: string[] = []
        const flaggedTokens: string[] = []
        let inFlagsSection = false
        for (const token of argTokens) {
            if (token.startsWith('-')) {
                inFlagsSection = true
            }
            if (inFlagsSection) {
                flaggedTokens.push(token)
            } else {
                positionalValues.push(token)
            }
        }

        const reconstructedArgs: string[] = [...commandPath]

        positionalValues.forEach((value, index) => {
            if (index < requiredOptions.length) {
                const option = requiredOptions[index]
                reconstructedArgs.push(`--${option.name}`)
                reconstructedArgs.push(value)
            } else {
                reconstructedArgs.push(value)
            }
        })

        reconstructedArgs.push(...flaggedTokens)

        return reconstructedArgs
            .map(arg => (/\s/).test(arg) ? `"${arg.replace(/"/g, '"')}"` : arg)
            .join(' ')
    }

    private _setSubcommandContextFromArgs(context: CommandContext, parsedArgs: ArgumentsCamelCase, commandData: RESTPostAPIChatInputApplicationCommandsJSONBody): void {
        const yargsCommandPath = parsedArgs?._?.map(String) ?? []
        const options = commandData.options ?? []
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

                    if (CommandManager.isGuildSlashCommand(command)) {
                        // This command requires a guild context. We must assert it at runtime.
                        if (!context.guild || !context.member) {
                            // This is a safeguard. In theory, a GuildSlashCommand should only be matched
                            // when the interaction/message is in a guild.
                            logger.warn(`{executeUnifiedCommand} Guild command "${command.data.name}" was executed in a non-guild context. This should not happen.`)
                            await context.reply("❌ This command can only be used in a server.")
                            return
                        }
                        // We've confirmed the context is valid, now we can call execute
                        // with the context cast to the more specific type.
                        await command.execute(context as GuildOnlyCommandContext)
                    } else {
                        // This is a global command, which can run anywhere.
                        // Its `execute` method expects the less-strict `CommandContext<boolean>`.
                        await command.execute(context)
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



    private buildYargsParserForCommand(commandDef: SlashCommand, message: Message, rawArgsString: string, prefix: string): Argv<{}> {
        const baseCommandData = commandDef.data.toJSON()
        const parser = yargs(rawArgsString)

        parser
            .scriptName(`${prefix}${baseCommandData.name}`)
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
                source.reply({ content: replyMessage, flags: MessageFlags.Ephemeral }).catch(err =>
                    logger.warn(`{handleError} Could not reply to interaction for ${commandName}: [${red(err.message)}]`)
                )
            }
        }

    }



    private normalizeCommandData(data: ExplicitAny): ExplicitAny {
        // Deep clone the current piece of data (could be a command, or an option)
        const normalized = JSON.parse(JSON.stringify(data))

        // If the current 'normalized' object represents an option (heuristic: has a 'type' property)
        // ensure its 'required' field is explicitly false if it's optional.
        if (typeof normalized.type === 'number') { // ApplicationCommandOptionType is numeric
            if (normalized.required === undefined || normalized.required === null) {
                normalized.required = false
            }
        }

        // If the current 'normalized' object can have an 'options' array
        // (i.e., it's a command, subcommand, or subcommand group)
        // then recursively normalize each option within that array.
        if (normalized.options && Array.isArray(normalized.options)) {
            normalized.options = normalized.options.map((opt: ExplicitAny) => {
                return this.normalizeCommandData(opt) // Recursive call for each option
            })
        } else if (normalized.options === undefined) {
            // If 'options' is undefined, we need to decide if it should be an empty array.
            // It should be an empty array for:
            // 1. The top-level command object (which doesn't have a 'type' itself, but has a 'name')
            // 2. Options of type Subcommand or SubcommandGroup.
            const isTopLevelCommandContext = typeof normalized.type === 'undefined' && normalized.name
            const isSubcommandOrGroupType = typeof normalized.type === 'number' &&
                (normalized.type === ApplicationCommandOptionType.Subcommand ||
                 normalized.type === ApplicationCommandOptionType.SubcommandGroup)

            if (isTopLevelCommandContext || isSubcommandOrGroupType) {
                normalized.options = []
            }
            // For other option types (string, integer etc.), 'options' should remain undefined if it was, which is correct.
        }
        // If normalized.options was some non-array, non-undefined value, this indicates a malformed structure
        // that the initial check `normalized.options && Array.isArray(normalized.options)` would handle,
        // or the .map would fail.

        return normalized
    }

    private async checkCommandChanges(commands: (SlashCommand | ContextMenuCommand)[], guildId?: string): Promise<boolean> {
        const remoteCommands = guildId
            ? await this.fetchGuildCommands(guildId)
            : await this.fetchGlobalCommands()

        if (remoteCommands.length !== commands.length) {
            logger.info(`{checkCommandChanges} Command count mismatch - Local: ${commands.length}, Remote: ${remoteCommands.length}`)
            return true
        }

        // Convert commands to their JSON representation and normalize them
        const localCommandData = commands.map(cmd => {
            const data = this.normalizeCommandData(cmd.data.toJSON())
            // Sort options to ensure consistent comparison
            if (data.options) {
                data.options = this.sortCommandOptions(data.options)
            }
            return data
        }).sort((a, b) => a.name.localeCompare(b.name))

        const remoteCommandData = remoteCommands.map(cmd => {
            // Ensure a deep clone of the remote command before normalization
            const data = this.normalizeCommandData(JSON.parse(JSON.stringify({ ...cmd })))
            if (data.options) {
                data.options = this.sortCommandOptions(data.options)
            }
            return data
        }).sort((a, b) => a.name.localeCompare(b.name))

        // Compare each command
        for (let i = 0; i < localCommandData.length; i++) {
            const local = localCommandData[i]
            const remote = remoteCommandData[i]

            if (!this.areCommandsEqual(local, remote)) {
                logger.info(`{checkCommandChanges} Command "${local.name}" has changes:`)
                this.logCommandDifferences(local, remote)
                return true
            }
        }

        return false
    }

    private sortCommandOptions(options: ExplicitAny[]): ExplicitAny[] {
        return options.map(opt => {
            const sortedOpt = { ...opt }
            if (opt.options) {
                sortedOpt.options = this.sortCommandOptions(opt.options)
            }
            return sortedOpt
        }).sort((a, b) => a.name.localeCompare(b.name))
    }

    private areCommandsEqual(local: ExplicitAny, remote: ExplicitAny): boolean {
        if (typeof local !== typeof remote) return false
        if (Array.isArray(local) !== Array.isArray(remote)) return false

        if (Array.isArray(local)) {
            if (local.length !== remote.length) return false
            return local.every((item, index) => this.areCommandsEqual(item, remote[index]))
        }

        if (typeof local === 'object' && local !== null) {
            // Discord API specific fields that we should ignore
            const ignoredFields = new Set([
                'id',                         // Discord's internal command ID
                'application_id',             // Bot's application ID
                'version',                    // Discord's internal version
                'guild_id',                   // For guild commands
                'dm_permission',              // Default: true
                'nsfw',                       // Default: false
                'integration_types',          // Default: [0,1]
                'contexts',                   // Handled by Discord.js
                'default_member_permissions'  // Default: null
            ])

            // Get keys that have actual values (not undefined)
            const localKeys = Object.keys(local).filter(key =>
                local[key] !== undefined && !ignoredFields.has(key)
            )
            const remoteKeys = Object.keys(remote).filter(key =>
                remote[key] !== undefined && !ignoredFields.has(key)
            )

            // Handle empty options array
            if ('options' in local || 'options' in remote) {
                // This was a specific check for an edge case, might need re-evaluation

                // const localOpts = local.options || []
                // const remoteOpts = remote.options || []
                // if (localOpts.length === 0 && (!remoteOpts || remoteOpts.length === 0)) {
                //     return true
                // }
            }

            // Filter out description for context menu commands from keys to be compared
            const filterDescriptionForContextMenu = (keys: string[], commandType?: number) => {
                if (commandType === ApplicationCommandType.Message || commandType === ApplicationCommandType.User) {
                    return keys.filter(key => key !== 'description')
                }
                return keys
            }

            const effectiveLocalKeys = filterDescriptionForContextMenu(localKeys, local.type)
            const effectiveRemoteKeys = filterDescriptionForContextMenu(remoteKeys, remote.type)


            // Compare remaining fields
            if (effectiveLocalKeys.length !== effectiveRemoteKeys.length) {
                 // For debugging:
                // if (local.name === "Quick Ace Combat 7 subtitle") {
                // logger.info(`{areCommandsEqual} Key length mismatch for ${local.name}. Local: ${effectiveLocalKeys.join(', ')}, Remote: ${effectiveRemoteKeys.join(', ')}`)
                // }
                return false
            }

            return effectiveLocalKeys.every(key => {
                if (!(key in remote)) {
                    // if (local.name === "Quick Ace Combat 7 subtitle") {
                    // logger.info(`{areCommandsEqual} Key ${key} missing in remote for ${local.name}`)
                    // }
                    return false
                }
                return this.areCommandsEqual(local[key], remote[key])
            })
        }

        return local === remote
    }

    private logCommandDifferences(local: ExplicitAny, remote: ExplicitAny, path: string = ''): void {
        const ignoredFields = new Set([
            'id',
            'application_id',
            'version',
            'guild_id',
            'dm_permission',
            'nsfw',
            'integration_types',
            'contexts',
            'default_member_permissions'
        ])

        if (typeof local !== typeof remote) {
            logger.debug(`{checkCommandChanges} Type mismatch at ${yellow(path)}: Local (${typeof local}) vs Remote (${typeof remote})`)
            return
        }

        if (Array.isArray(local)) {
            if (local.length !== remote.length && !(path.endsWith('.options') && local.length === 0 && (!remote || remote.length === 0))) {
                logger.debug(`{checkCommandChanges} Array length mismatch at ${yellow(path)}: Local (${local.length}) vs Remote (${remote.length})`)
            }
            local.forEach((item, index) => {
                if (index < remote.length) {
                    this.logCommandDifferences(item, remote[index], `${path}[${index}]`)
                }
            })
            return
        }

        if (typeof local === 'object' && local !== null) {
            const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)])

            allKeys.forEach(key => {
                if (ignoredFields.has(key)) return
                if (key === 'description' && (local.type === ApplicationCommandType.Message || local.type === ApplicationCommandType.User || remote.type === ApplicationCommandType.Message || remote.type === ApplicationCommandType.User)) {
                    return
                }

                const localValue = local[key]
                const remoteValue = remote[key]

                // Special handling for required field at any depth and for empty options array
                if (key === 'required') {
                    if (!localValue && remoteValue === false) return
                }
                if (key === 'options' && (!localValue || localValue.length === 0) && (!remoteValue || remoteValue.length === 0)) {
                    return
                }

                const pathKeyString = (path: string, key: string) => yellow(`${path}.${key}`)

                if (localValue === undefined && remoteValue !== undefined) {

                    logger.debug(`{checkCommandChanges} Missing in local at ${pathKeyString(path, key)}: ${yellow(JSON.stringify(remoteValue))}`)

                } else if (remoteValue === undefined && localValue !== undefined) {

                    logger.debug(`{checkCommandChanges} Missing in remote at ${pathKeyString(path, key)}: ${yellow(JSON.stringify(localValue))}`)

                } else if (!this.areCommandsEqual(localValue, remoteValue)) {

                    if (typeof localValue !== 'object' || localValue === null) {
                        logger.debug(`{checkCommandChanges} Value mismatch at ${pathKeyString(path, key)}: Local (${yellow(JSON.stringify(localValue))}) vs Remote (${yellow(JSON.stringify(remoteValue))})`)
                    } else {
                        this.logCommandDifferences(localValue, remoteValue, `${pathKeyString(path, key)}`)
                    }

                }
            })
            return
        }

        if (local !== remote) {
            logger.debug(`{checkCommandChanges} Value mismatch at ${yellow(path)}: Local (${JSON.stringify(local)}) vs Remote (${JSON.stringify(remote)})`)
        }
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



    private tokenizeArgs(str: string): string[] {
        const tokens: string[] = []
        // This regex splits by spaces, but keeps quoted sections together.
        const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g
        let match
        while ((match = regex.exec(str))) {
            // Add the captured group if it exists (for quotes), otherwise the full match.
            tokens.push(match[1] ?? match[2] ?? match[0])
        }
        return tokens
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

export class CommandContext<InGuild extends boolean = boolean> {
    private originalMessageReply: Message | null = null

    public readonly client: Client<true>
    public readonly interaction: ChatInputCommandInteraction | null
    public readonly message: Message | null
    public readonly embiId: typeof EMBI_ID = EMBI_ID
    public readonly pingEmbi: typeof PING_EMBI = PING_EMBI

    public readonly args: string[]
    public parsedArgs: ArgumentsCamelCase<{ [key: string]: JSONResolvable }> | null = null
    public subcommandName: string | null = null
    public subcommandGroupName: string | null = null

    public readonly guild: InGuild extends true ? Guild : Guild | null
    public readonly member: InGuild extends true ? GuildMember : GuildMember | null


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
        this.guild = (this.interaction ? this.interaction.guild : this.message!.guild) as InGuild extends true ? Guild : Guild | null
        this.member = (this.interaction ? guildMember(this.interaction.member) : this.message!.member) as InGuild extends true ? GuildMember : GuildMember | null
    }



    get isInteraction(): boolean { return this.interaction !== null }
    get isMessage(): boolean { return this.message !== null }
    get author(): User { return this.interaction ? this.interaction.user : this.message!.author }
    get user(): User { return this.author }
    get isEmbi(): boolean { return this.user.id === this.embiId }

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
    public async ephemeralReply(options: string | InteractionReplyOptions | MessageReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction) {
            // For slash commands, use ephemeral interaction reply
            const replyOptions: InteractionReplyOptions = typeof options === 'string'
                ? { content: options, ephemeral: true }
                : { ...options as InteractionReplyOptions, ephemeral: true }

            if (this.interaction.isRepliable() && !this.interaction.replied && !this.interaction.deferred) {
                return this.interaction.reply(replyOptions)
            } else if (this.interaction.isRepliable()) {
                return this.interaction.followUp(replyOptions)
            }
        } else if (this.message) {
            // For text commands, attempt to DM the user
            try {
                const dmChannel = await this.author.createDM()
                await dmChannel.send(options as string | MessageReplyOptions)
            } catch (error) {
                logger.warn(`{ephemeralReply} Could not DM user ${this.author.tag} (${this.author.id}). Replying to channel instead. Error: ${error instanceof DiscordAPIError ? error.message : error}`)
                const errorMessage = typeof options === 'string'
                    ? `I tried to send you a private message, but I couldn't. Please check your privacy settings. (Original message: "${options.substring(0, 100)}${options.length > 100 ? '...' : ''}")`
                    : `I tried to send you a private message, but I couldn't. Please check your privacy settings.`

                await this.message.reply({
                    content: `❌ ${errorMessage}`,
                    allowedMentions: { repliedUser: false }
                }).catch(err => {
                    logger.warn(`{ephemeralReply} Failed to send fallback error reply to message: ${err.message}`)
                })
            }
        }
    }
    async deferReply(options?: InteractionDeferReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction && this.interaction.isRepliable() && !this.interaction.deferred) {
            return this.interaction.deferReply(options)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function') {
                this.originalMessageReply = await this.message.reply(`${TYPING_EMOJI} ${this.client.user.displayName} is thinking...`)
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
                // If editing with only embeds or attachments, and no content, erase the message content (replicates the interaction reply edit behavior)
                if (
                    typeof options === 'object' &&
                    options !== null &&
                    ((
                        'embeds' in options &&
                        Array.isArray(options.embeds) &&
                        options.embeds.length > 0 &&
                        !('content' in options)
                    ) || (
                        'attachments' in options &&
                        Array.isArray(options.attachments) &&
                        options.attachments.length > 0 &&
                        !('content' in options)
                    ))
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



    public getStringOption(name: string, required: true): string
    public getStringOption(name: string, required?: false): string | null
    public getStringOption(name: string): string | null
    public getStringOption(name: string, required?: boolean): string | null
    public getStringOption(name: string, required: true, defaultValue?: undefined): string
    public getStringOption(name: string, required: false, defaultValue: string): string
    public getStringOption(name: string, required?: boolean, defaultValue?: string): string | null
    public getStringOption(name: string, required?: boolean, defaultValue?: string | null): string | null {
        let value: string | null = null
        if (this.interaction) {
            value = this.interaction.options.getString(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = parsedValue !== undefined && parsedValue !== null ? String(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getIntegerOption(name: string, required: true): number
    public getIntegerOption(name: string, required?: false): number | null
    public getIntegerOption(name: string): number | null
    public getIntegerOption(name: string, required?: boolean): number | null
    public getIntegerOption(name: string, required: true, defaultValue?: undefined): number
    public getIntegerOption(name: string, required: false, defaultValue: number): number
    public getIntegerOption(name: string, required?: boolean, defaultValue?: number): number | null
    public getIntegerOption(name: string, required?: boolean, defaultValue?: number | null): number | null {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getInteger(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = Number.isInteger(parsedValue) ? Number(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getBooleanOption(name: string, required: true): boolean
    public getBooleanOption(name: string, required?: false): boolean | null
    public getBooleanOption(name: string): boolean | null
    public getBooleanOption(name: string, required?: boolean): boolean | null
    public getBooleanOption(name: string, required: true, defaultValue?: undefined): boolean
    public getBooleanOption(name: string, required: false, defaultValue: boolean): boolean
    public getBooleanOption(name: string, required?: boolean, defaultValue?: boolean): boolean | null
    public getBooleanOption(name: string, required?: boolean, defaultValue?: boolean | null): boolean | null {
        let value: boolean | null = null
        if (this.interaction) {
            value = this.interaction.options.getBoolean(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            // For yargs, a boolean flag not present might be undefined. If present, it's true/false.
            value = typeof parsedValue === 'boolean' ? parsedValue : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined && defaultValue !== null) {
            return defaultValue
        }
        // For booleans, if not required and no default, null is a valid "not provided" state.
        // If a default is explicitly null, it should also return null.
        return value
    }

    public async getUserOption(name: string, required: true): Promise<User>
    public async getUserOption(name: string, required?: false): Promise<User | null>
    public async getUserOption(name: string): Promise<User | null>
    public async getUserOption(name: string, required?: boolean): Promise<User | null>
    public async getUserOption(name: string, required: true, defaultValue?: undefined): Promise<User>
    public async getUserOption(name: string, required: false, defaultValue: User): Promise<User>
    public async getUserOption(name: string, required?: boolean, defaultValue?: User): Promise<User | null>
    public async getUserOption(name: string, required?: boolean, defaultValue?: User | null): Promise<User | null> {
        let value: User | null = null
        if (this.interaction) {
            value = this.interaction.options.getUser(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveUser(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            if (!defaultValue) return null
            try {
                // Try to fetch the default user to ensure it's up to date
                return await this.client.users.fetch(defaultValue.id)
            } catch {
                // If fetch fails, fall back to the provided default value
                return defaultValue
            }
        }
        return value
    }

    public async getMemberOption(name: string, required: true): Promise<GuildMember>
    public async getMemberOption(name: string, required?: false): Promise<GuildMember | null>
    public async getMemberOption(name: string): Promise<GuildMember | null>
    public async getMemberOption(name: string, required?: boolean): Promise<GuildMember | null>
    public async getMemberOption(name: string, required: true, defaultValue?: undefined): Promise<GuildMember>
    public async getMemberOption(name: string, required: false, defaultValue: GuildMember): Promise<GuildMember>
    public async getMemberOption(name: string, required?: boolean, defaultValue?: GuildMember): Promise<GuildMember | null>
    public async getMemberOption(name: string, required?: boolean, defaultValue?: GuildMember | null): Promise<GuildMember | null> {
        let member: GuildMember | null = null
        if (this.interaction) {
            member = guildMember(this.interaction.options.getMember(name)) // getMember can return APIInteractionGuildMember | GuildMember | null
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            member = parsedVal ? await this.resolveMember(parsedVal) : null
        }

        if (required && member === null) {
            throw new Error(`Required member option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (member === null && !required && defaultValue !== undefined && this.guild) {
            if (!defaultValue) return null
            try {
                // Try to fetch the default member to ensure it's up to date
                return await this.guild.members.fetch(defaultValue.id)
            } catch {
                // If fetch fails, fall back to the provided default value
                return defaultValue
            }
        }
        return member
    }

    public async getChannelOption(name: string, required: true): Promise<GuildBasedChannel>
    public async getChannelOption(name: string, required?: false): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string, required?: boolean): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string, required: true, defaultValue?: undefined): Promise<GuildBasedChannel>
    public async getChannelOption(name: string, required: false, defaultValue: GuildBasedChannel): Promise<GuildBasedChannel>
    public async getChannelOption(name: string, required?: boolean, defaultValue?: GuildBasedChannel): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string, required?: boolean, defaultValue?: GuildBasedChannel | null): Promise<GuildBasedChannel | null> {
        let value: GuildBasedChannel | null = null
        if (this.interaction) {
            value = this.interaction.options.getChannel(name, false) as GuildBasedChannel | null // Always fetch as non-required first
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveChannel(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public async getRoleOption(name: string, required: true): Promise<Role>
    public async getRoleOption(name: string, required?: false): Promise<Role | null>
    public async getRoleOption(name: string): Promise<Role | null>
    public async getRoleOption(name: string, required?: boolean): Promise<Role | null>
    public async getRoleOption(name: string, required: true, defaultValue?: undefined): Promise<Role>
    public async getRoleOption(name: string, required: false, defaultValue: Role): Promise<Role>
    public async getRoleOption(name: string, required?: boolean, defaultValue?: Role): Promise<Role | null>
    public async getRoleOption(name: string, required?: boolean, defaultValue?: Role | null): Promise<Role | null> {
        let value: Role | null = null
        if (this.interaction) {
            value = this.interaction.options.getRole(name, false) as Role | null // Always fetch as non-required first
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveRole(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getNumberOption(name: string, required: true): number
    public getNumberOption(name: string, required?: false): number | null
    public getNumberOption(name: string): number | null
    public getNumberOption(name: string, required?: boolean): number | null
    public getNumberOption(name: string, required: true, defaultValue?: undefined): number
    public getNumberOption(name: string, required: false, defaultValue: number): number
    public getNumberOption(name: string, required?: boolean, defaultValue?: number): number | null
    public getNumberOption(name: string, required?: boolean, defaultValue?: number | null): number | null {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getNumber(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = typeof parsedValue === 'number' ? parsedValue : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getAttachmentOption(name: string, required: true): Attachment
    public getAttachmentOption(name: string, required?: false): Attachment | null
    public getAttachmentOption(name: string): Attachment | null
    public getAttachmentOption(name: string, required?: boolean): Attachment | null
    public getAttachmentOption(name: string, required: true, defaultValue?: undefined): Attachment
    public getAttachmentOption(name: string, required: false, defaultValue: Attachment): Attachment
    public getAttachmentOption(name: string, required?: boolean, defaultValue?: Attachment): Attachment | null
    public getAttachmentOption(name: string, required?: boolean, defaultValue?: Attachment | null): Attachment | null {
        let value: Attachment | null = null
        if (this.interaction) {
            value = this.interaction.options.getAttachment(name, false) // Always fetch as non-required first
        } else if (this.message && this.parsedArgs) {
            const attachmentFlagPresent = this.parsedArgs[name] === true || typeof this.parsedArgs[name] === 'string'
            if (attachmentFlagPresent && this.message.attachments.size > 0) {
                value = this.message.attachments.first()! // Non-null assertion as size > 0
            }
        }

        if (required && value === null) {
            throw new Error(`Required attachment "${name}" is missing or was not provided correctly for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getSubcommand(required?: false): string | null
    public getSubcommand(required: true): string
    public getSubcommand(required?: boolean): string | null {
        if (required && !this.subcommandName) {
            throw new Error('A subcommand was required but not provided or identified.')
        }
        return this.subcommandName
    }

    public getSubcommandGroup(required?: false): string | null
    public getSubcommandGroup(required: true): string
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



    public async getInstallationType(): Promise<BotInstallationType> {
        // Logic 1: Message Command -> Guaranteed Guild Install
        if (!this.isInteraction) {
            return BotInstallationType.GuildInstall
        }

        // Logic 2: Slash Command - Check if it's a DM/Group DM or a Guild
        const interaction = this.interaction!
        if (!interaction.guildId) {
            // No raw guildId means it's a DM/Group DM context for a slash command
            return BotInstallationType.UserInstallDM
        } else {
            // Raw guildId is present, so the command was run in a guild channel.
            // Now, distinguish between Guild Install and User Install *within this guild*.
            // The key here is whether the bot exists as a member in this guild.
            if (this.guild) { // Check if the full Guild object is available (implies bot might be in cache or fetchable)
                let botMember: GuildMember | undefined | null = this.guild.members.cache.get(this.client.user.id)
                if (!botMember) {
                    try {
                        // Attempt to fetch if not in cache. Requires GUILD_MEMBERS intent.
                        // This fetch will only succeed if the bot is actually in the guild and has intent.
                        // If it's a user-installed command in a guild where bot isn't member, this will likely fail or return null.
                        botMember = await this.guild.members.fetch(this.client.user.id)
                    } catch {
                        // Error likely means bot is not in guild or permissions/intents issue.
                        // Treat as bot member not found for this purpose.
                        // console.error(`Failed to fetch bot member in guild ${context.guild.id}:`, error) // Log if needed, but might be noisy for user installs
                        botMember = null
                    }
                }

                if (botMember) {
                    // Logic 3a: In a guild, and bot is found as a member. This is a Guild Install.
                    // This handles the scenario where the bot is both Guild & User installed correctly.
                    return BotInstallationType.GuildInstall
                } else {
                    // Logic 3b: In a guild (guildId present), but bot is NOT found as a member.
                    // This means the command was executed via user-install permission.
                    return BotInstallationType.UserInstallGuild
                }
            } else {
                // Logic 3c: interaction.guildId present, but context.guild is null.
                // As observed in logs, this happens for user-installed commands in guilds.
                // Since guildId exists but bot isn't a member (implied by null context.guild),
                // it must be a User Install in a guild context.
                return BotInstallationType.UserInstallGuild
            }
        }
    }
}
