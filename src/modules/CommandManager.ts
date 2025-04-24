const esmodules = !!import.meta.url

import { Logger, yellow, red } from '../util/logger'
const logger = new Logger('CommandManager')

import {
    SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField,
    ContextMenuCommandBuilder, ContextMenuCommandInteraction, Client,
    type SlashCommandSubcommandsOnlyBuilder, CommandInteraction,
    type SlashCommandOptionsOnlyBuilder, UserContextMenuCommandInteraction,
    MessageContextMenuCommandInteraction,
    type PermissionsString
} from 'discord.js'

import { readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { hasProp } from '../util/functions'
import { operationTracker } from './OperationTracker'
import type { ExplicitAny } from '../types/types'


type SlashCommandHelpers = {
    reply: ChatInputCommandInteraction['reply'],
    deferReply: ChatInputCommandInteraction['deferReply'],
    editReply: ChatInputCommandInteraction['editReply'],
    followUp: ChatInputCommandInteraction['followUp'],
    client: ChatInputCommandInteraction['client']
}
type SlashCommandProps = {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder
    permissions?: PermissionsBitField[]
    execute: (
        interaction: ChatInputCommandInteraction,
        helpers: SlashCommandHelpers
    ) => Promise<void>
}

export interface ISlashCommand extends SlashCommandProps {}
export abstract class SlashCommand implements ISlashCommand {
    data!: SlashCommandProps['data']
    permissions?: SlashCommandProps['permissions']
    execute!: SlashCommandProps['execute']
}

export interface IGuildSlashCommand extends ISlashCommand {
    guildId: string
}
export abstract class GuildSlashCommand extends SlashCommand implements IGuildSlashCommand {
    guildId!: string
}



type ContextMenuCommandProps<T extends 2 | 3 = 2 | 3> = {
    data: ContextMenuCommandBuilder
    type: T
    execute: (
        interaction: ContextMenuInteractionType<T>,
        helpers: SlashCommandHelpers
    ) => Promise<void>
    permissions?: SlashCommandProps['permissions']
}
type ContextMenuInteractionType<T extends 2 | 3> = T extends 2
    ? UserContextMenuCommandInteraction
    : MessageContextMenuCommandInteraction

export interface IContextMenuCommand<T extends 2 | 3 = 2 | 3> extends ContextMenuCommandProps<T> {}
export abstract class ContextMenuCommand<T extends 2 | 3 = 2 | 3> implements IContextMenuCommand<T> {
    data!: ContextMenuCommandProps<T>['data']
    type!: ContextMenuCommandProps<T>['type']
    execute!: ContextMenuCommandProps<T>['execute']
    permissions?: ContextMenuCommandProps['permissions']
}



export default class CommandManager {
    private static instance: CommandManager
    private globalCommands: Map<string, SlashCommand> = new Map()
    private guildCommands: Map<string, Map<string, GuildSlashCommand>> = new Map()
    private contextMenuCommands: Map<string, ContextMenuCommand> = new Map()
    private initialized = false
    private client: Client | null = null

    private constructor() {}

    public static getInstance(): CommandManager {
        if (!CommandManager.instance) {
            CommandManager.instance = new CommandManager()
        }
        return CommandManager.instance
    }

    public setClient(client: Client) {
        this.client = client
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
        logger.info(`{importCommand} Importing ${yellow(file.name)}...`)
        const startTime = Date.now()
        try {
            const importedModule = await import(path.join(esmodules ? path.dirname(fileURLToPath(import.meta.url)) : __dirname, `../commands/${file.name}`))
            const commands: (SlashCommand | ContextMenuCommand)[] = []

            // Handle both default and named exports
            for (const [_, exportedItem] of Object.entries(importedModule)) {
                if (typeof exportedItem !== 'object' || !exportedItem) continue

                // Check if the exported item has required command properties
                if (!('data' in exportedItem) || !('execute' in exportedItem)) continue

                const command = exportedItem as SlashCommand | ContextMenuCommand

                if (CommandManager.isContextMenuCommand(command)) {
                    const type = command.type === 2 ? 'user' : 'message'
                    logger.ok(`{importCommand} Found ${yellow(type)} context menu command ${yellow(command.data.name)}`)
                    command.data.setType(command.type)
                    this.contextMenuCommands.set(command.data.name, command)
                    commands.push(command)
                } else if (CommandManager.isGuildSlashCommand(command)) {
                    logger.ok(`{importCommand} Found guild slash command /${yellow(command.data.name)} for guild ${yellow(command.guildId)}`)
                    if (!this.guildCommands.has(command.guildId)) {
                        this.guildCommands.set(command.guildId, new Map())
                    }
                    this.guildCommands.get(command.guildId)!.set(command.data.name, command)
                    commands.push(command)
                } else if (CommandManager.isGlobalSlashCommand(command)) {
                    logger.ok(`{importCommand} Found slash command /${yellow(command.data.name)}`)
                    this.globalCommands.set(command.data.name, command)
                    commands.push(command)
                }
            }

            if (commands.length === 0) {
                logger.warn(`{importCommand} No valid commands found in ${yellow(file.name)}`)
                return null
            }

            logger.ok(`{importCommand} Imported ${yellow(commands.length)} commands from file ${yellow(file.name)} in ${yellow((Date.now() - startTime) / 1000)}s`)
            return commands
        } catch (err) {
            console.log(err)
            return null
        }
    }

    private async loadCommands(dir: string) {
        logger.info(`{loadCommands} Reading commands from ${yellow(dir)}...`)
        const files = await readdir(dir, { withFileTypes: true })
        logger.info(`{loadCommands} Found ${yellow(files.length)} files in ${yellow(dir)}`)
        for (const file of files) {
            if (file.isDirectory()) {
                await this.loadCommands(path.join(dir, file.name))
            } else if (file.isFile() && file.name.endsWith('.ts')) {
                await this.importCommand(file)
            }
        }
        logger.ok(`{loadCommands} Finished loading commands in ${yellow(dir)}`)
    }

    public async handleInteraction(interaction: CommandInteraction | ContextMenuCommandInteraction): Promise<void> {
        if (!this.initialized) throw new ClassNotInitializedError()
        const matchingCommand = this.findMatchingCommand(interaction)
        if (!matchingCommand) {
            const errorMessage = `Command ${interaction.commandName} not found`
            logger.warn(`{handleInteraction} Unknown command /${yellow(interaction.commandName)}`)
            const error = new Error(errorMessage)
            this.handleError(error, interaction)
            return
        }
        try {
            await this.executeCommand(matchingCommand, interaction)
        } catch (e) {
            this.handleError(e as Error, interaction)
            return
        }
    }

    private findMatchingCommand(interaction: CommandInteraction | ContextMenuCommandInteraction) {
        if (interaction.isChatInputCommand()) {
            // First check guild commands
            const guildCommands = this.guildCommands.get(interaction.guildId!)
            if (guildCommands) {
                const guildCommand = guildCommands.get(interaction.commandName)
                if (guildCommand) return guildCommand
            }

            // Then check global commands
            return this.globalCommands.get(interaction.commandName)
        } else if (interaction.isContextMenuCommand()) {
            return this.contextMenuCommands.get(interaction.commandName)
        }
        return undefined
    }

    private async executeCommand(command: SlashCommand | ContextMenuCommand<2 | 3>, interaction: CommandInteraction | ContextMenuCommandInteraction) {
        return operationTracker.track(
            `command:${interaction.commandName}`,
            'COMMAND',
            async () => {
                try {
                    if (!command.execute) {
                        throw new Error(`Command ${interaction.commandName} does not have an execute method`)
                    }

                    const helpers: SlashCommandHelpers = {
                        reply: interaction.reply.bind(interaction),
                        deferReply: interaction.deferReply.bind(interaction),
                        editReply: interaction.editReply.bind(interaction),
                        followUp: interaction.followUp.bind(interaction),
                        client: interaction.client
                    }

                    const memberPermissions = interaction.memberPermissions ?? new PermissionsBitField()
                    if (command.permissions && memberPermissions.missing(command.permissions)) {
                        throw new MissingPermissionsError('Missing permissions to run the command', memberPermissions.missing(command.permissions))
                    }

                    if (interaction.isChatInputCommand() && CommandManager.isSlashCommand(command)) {
                        await command.execute(interaction, helpers)
                    } else if (interaction.isContextMenuCommand() && CommandManager.isContextMenuCommand(command)) {
                        if (interaction.isUserContextMenuCommand() && command.type === 2) {
                            await (command.execute as (i: UserContextMenuCommandInteraction, helpers: SlashCommandHelpers) => Promise<void>)(interaction, helpers)
                        } else if (interaction.isMessageContextMenuCommand() && command.type === 3) {
                            await (command.execute as (i: MessageContextMenuCommandInteraction, helpers: SlashCommandHelpers) => Promise<void>)(interaction, helpers)
                        } else {
                            throw new Error('Context menu command type mismatch with interaction type')
                        }
                    } else {
                        throw new Error('Command type mismatch with interaction type')
                    }
                } catch (err) {
                    const error = err as Error
                    logger.warn(`{executeCommand} Error in ${yellow(command.data.name)} => ${red(error.message)}`)
                    if (error.message === 'Unknown interaction') {
                        logger.warn(`{executeCommand} Error is "Unknown interaction", did the interaction time out on Discord's end?`)
                        return
                    }
                    logger.warn('{executeCommand} Error isn\'t "Unknown interaction", throwing it again, let `handleError()` deal with it')
                    throw err
                }
            }
        )
    }

    private handleError(e: Error, interaction: CommandInteraction | ContextMenuCommandInteraction) {
        logger.warn(`{handleInteraction} Error in ${yellow(interaction.commandName)}: ${red(e.message)}`)
        try {
            if (!interaction.deferred) interaction.reply(`❌ Deferred interraction error: \`${e.message}\``)
            else interaction.editReply(`❌ Interaction error: \`${e.message}\``)
        } catch (err) {
            logger.warn(`{handleInteraction} Could not reply to the interaction to signal the error; did the interaction time out? [${red(err instanceof Error ? err.message : String(err))}]`)
        }
    }

    public async refreshGlobalCommands() {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{refreshGlobalCommands}...')
        await this.client.application!.commands.set([
            ...this.globalCommands.values(),
            ...this.contextMenuCommands.values()
        ].map(command => command.data))
        logger.ok('{refreshGlobalCommands}')
    }

    public async refreshGuildCommands(guildId: string) {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info(`{refreshGuildCommands}...`)
        const guild = await this.client.guilds.fetch(guildId)
        if (!guild) {
            logger.error(`{refreshGuildCommands} ${yellow(guildId)}!`)
            return
        }
        logger.info(`{refreshGuildCommands} ${yellow(guildId)} - ${yellow(guild.name)}`)
        const guildCommands = this.guildCommands.get(guildId)
        if (guildCommands) {
            await guild.commands.set([...guildCommands.values()].map(command => command.data))
        }
        logger.ok(`{refreshGuildCommands} ${yellow(guildId)} - ${yellow(guild.name)}`)
    }
    public async refreshAllGuildCommands() {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{refreshAllGuildCommands}...')
        for (const command of this.guildCommands.values()) {
            for (const commandInGuild of command.values()) {
                await this.refreshGuildCommands(commandInGuild.guildId)
            }
        }
        logger.ok('{refreshAllGuildCommands}')
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

class ClassNotInitializedError extends Error {
    message = 'Command handler has not been initialized! Call init() first'
}
export class MissingPermissionsError extends Error {
    permissions: PermissionsBitField[] | PermissionsString[]
    constructor(message: string, permissions: PermissionsBitField[] | PermissionsString[]) {
        super(message)
        this.permissions = permissions
    }
}
