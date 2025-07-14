import { Logger, yellow } from '../../util/logger'
const logger = new Logger('CommandRegistry')

import { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandOptionType, ApplicationCommandType, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from 'discord.js'
import type { APIApplicationCommandOption, Client } from 'discord.js'
import { readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'

import type { SlashCommand, GuildSlashCommand, ContextMenuCommand, ExplicitAny, GuildId } from '../../types'

type CommandBuilderWithOptions = SlashCommandBuilder | SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder;

export class CommandRegistry {
    private currentDir = ''
    public readonly globalCommands: Map<string, SlashCommand> = new Map()
    public readonly guildCommands: Map<GuildId, Map<string, GuildSlashCommand>> = new Map()
    public readonly contextMenuCommands: Map<string, ContextMenuCommand> = new Map()

    constructor(private client: Client) {}

    public async loadCommands(dir: string) {
        logger.info(`{loadCommands} Reading commands from ${yellow(dir)}...`)
        const files = await readdir(dir, { withFileTypes: true })
        logger.ok(`{loadCommands} Found ${yellow(files.length)} files in ${yellow(dir)}`)

        const importPromises: Promise<{ file: string; commands: { name: string; type: string; guildId?: string, aliases?: string[] }[]; time: number; error?: unknown }>[] = []
        for (const file of files) {
            if (file.isDirectory()) {
                await this.loadCommands(path.join(dir, file.name))
            } else if (file.isFile() && file.name.endsWith('.ts')) {
                importPromises.push(this.importCommand(file))
            }
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

    private async importCommand(file: Dirent) {
        const startTime = Date.now()
        try {
            const importedModule = await import(`../../commands/${file.name}`)
            const commands: (SlashCommand | ContextMenuCommand)[] = []
            const commandInfo: { name: string, type: string, guildId?: GuildId, aliases?: string[] }[] = []

            for (const [_, exportedItem] of Object.entries(importedModule)) {
                if (typeof exportedItem !== 'object' || !exportedItem) continue
                if (!('data' in exportedItem) || !('execute' in exportedItem)) continue
                const command = exportedItem as SlashCommand | ContextMenuCommand

                if (this.isContextMenuCommand(command)) {
                    const type = command.type === 2 ? 'user' : 'message'
                    command.data.setType(command.type)
                    const key = `${command.data.name}-${type}`
                    this.contextMenuCommands.set(key, command)
                    commands.push(command)
                    commandInfo.push({ name: command.data.name, type: `${type} context menu` })
                } else if (this.isGuildSlashCommand(command)) {
                    if (!this.guildCommands.has(command.guildId)) this.guildCommands.set(command.guildId, new Map())
                    this.guildCommands.get(command.guildId)!.set(command.data.name, command)
                    commands.push(command)
                    commandInfo.push({ name: command.data.name, type: 'guild slash', guildId: command.guildId, aliases: command.aliases })
                } else if (this.isGlobalSlashCommand(command)) {
                    this.globalCommands.set(command.data.name, command)
                    commands.push(command)
                    commandInfo.push({ name: command.data.name, type: 'global slash/text', aliases: command.aliases })
                }

                if (this.isSlashCommand(command) && command.aliases && command.aliases.length > 0) {
                    for (const alias of command.aliases) {
                        const commandCopy: SlashCommand = {
                            ...command,
                            aliases: undefined,
                            ...(this.isGuildSlashCommand(command) ? { guildId: command.guildId } : {})
                        }
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

    public cloneCommandBuilder<T extends SlashCommandBuilder | ContextMenuCommandBuilder>(
        originalBuilder: T,
        newName?: string
    ): T {
        const originalJson = originalBuilder.toJSON()

        if (originalBuilder instanceof SlashCommandBuilder && 'description' in originalJson) {
            const newBuilder = new SlashCommandBuilder()

            if (originalJson.description) newBuilder.setDescription(originalJson.description)
            if (originalJson.contexts !== undefined && Array.isArray(originalJson.contexts)) {
                newBuilder.setContexts(originalJson.contexts)
            }
            if (originalJson.nsfw !== undefined) newBuilder.setNSFW(originalJson.nsfw)
            if (originalJson.default_member_permissions) {
                newBuilder.setDefaultMemberPermissions(originalJson.default_member_permissions)
            }

            if (originalJson.options) {
                for (const option of originalJson.options) {
                    this.addOptionToBuilder(newBuilder, option)
                }
            }

            newBuilder.setName(newName ?? originalJson.name)
            return newBuilder as T
        } else if (originalBuilder instanceof ContextMenuCommandBuilder) {
            const newBuilder = new ContextMenuCommandBuilder()
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

        throw new Error('Unsupported builder type provided.')
    }

    private addOptionToBuilder(builder: CommandBuilderWithOptions, option: APIApplicationCommandOption): void {
        if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
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
            return
        }

        if (option.type === ApplicationCommandOptionType.Subcommand) {
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
            return
        }

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

    public isSlashCommand = (obj: unknown): obj is SlashCommand => {
        return this.hasProp(obj, 'data') && (obj as ExplicitAny).data instanceof SlashCommandBuilder
    }

    public isGuildSlashCommand = (obj: unknown): obj is GuildSlashCommand => {
        return (
            this.isSlashCommand(obj) &&
            'guildId' in obj &&
            typeof (obj as ExplicitAny).guildId === 'string'
        )
    }

    public isGlobalSlashCommand = (obj: unknown): obj is SlashCommand => {
        return (
            this.isSlashCommand(obj) &&
            !('guildId' in obj)
        )
    }

    public isContextMenuCommand = (obj: unknown): obj is ContextMenuCommand => {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'data' in obj &&
            'type' in obj &&
            (obj as ExplicitAny).data instanceof ContextMenuCommandBuilder &&
            ((obj as ExplicitAny).type === 2 || (obj as ExplicitAny).type === 3)
        )
    }

    private hasProp<T extends object, K extends PropertyKey>(
        obj: unknown,
        prop: K
    ): obj is T & Record<K, unknown> {
        return typeof obj === 'object' && obj !== null && prop in obj
    }
}
