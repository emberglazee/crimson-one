import { Logger } from '../util/logger'
const logger = Logger.new('CommandManager')

import {
    SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField,
    ContextMenuCommandBuilder, ContextMenuCommandInteraction, Client,
    type SlashCommandSubcommandsOnlyBuilder, CommandInteraction,
    type SlashCommandOptionsOnlyBuilder,
    UserContextMenuCommandInteraction,
    MessageContextMenuCommandInteraction
} from 'discord.js'

import { readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const esmodules = !!import.meta.url

export interface ISlashCommand {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder
    permissions?: PermissionsBitField[]
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}
export abstract class SlashCommand implements ISlashCommand {
    data!: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder
    permissions?: PermissionsBitField[]
    execute!: (interaction: ChatInputCommandInteraction) => Promise<void>
}

export interface IGuildSlashCommand extends ISlashCommand {
    guildId: string
}
export abstract class GuildSlashCommand extends SlashCommand implements IGuildSlashCommand {
    guildId!: string
}

type ContextMenuInteractionType<T extends 2 | 3> = T extends 2 
    ? UserContextMenuCommandInteraction 
    : MessageContextMenuCommandInteraction

export interface IContextMenuCommand<T extends 2 | 3 = 2 | 3> {
    data: ContextMenuCommandBuilder
    type: T
    execute: (interaction: ContextMenuInteractionType<T>) => Promise<void>
}

export abstract class ContextMenuCommand<T extends 2 | 3 = 2 | 3> implements IContextMenuCommand<T> {
    data!: ContextMenuCommandBuilder
    type!: T
    execute!: (interaction: ContextMenuInteractionType<T>) => Promise<void>
}

export default class CommandHandler {
    private static instance: CommandHandler
    private globalCommands: SlashCommand[] = []
    private guildCommands: GuildSlashCommand[] = []
    private contextMenuCommands: ContextMenuCommand[] = []
    private initialized = false
    private client: Client | null = null

    private constructor() {}

    public static getInstance(): CommandHandler {
        if (!CommandHandler.instance) {
            CommandHandler.instance = new CommandHandler()
        }
        return CommandHandler.instance
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
        logger.ok(`{init} Total time: ${totalTime}s`)
    }

    private async importCommand(file: Dirent) {
        logger.info(`{importCommand} Importing ${file.name}...`)
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

                if (CommandHandler.isContextMenuCommand(command)) {
                    const type = command.type === 2 ? 'user' : 'message'
                    logger.ok(`{importCommand} Found ${type} context menu command ${command.data.name}`)
                    command.data.setType(command.type)
                    this.contextMenuCommands.push(command)
                    commands.push(command)
                } else if (CommandHandler.isGuildSlashCommand(command)) {
                    logger.ok(`{importCommand} Found guild slash command /${command.data.name} for guild ${command.guildId}`)
                    this.guildCommands.push(command)
                    commands.push(command)
                } else if (CommandHandler.isGlobalSlashCommand(command)) {
                    logger.ok(`{importCommand} Found slash command /${command.data.name}`)
                    this.globalCommands.push(command)
                    commands.push(command)
                }
            }

            if (commands.length === 0) {
                logger.warn(`{importCommand} No valid commands found in ${file.name}`)
                return null
            }

            logger.ok(`{importCommand} Imported ${commands.length} commands from file ${file.name} in ${(Date.now() - startTime) / 1000}s`)
            return commands
        } catch (err) {
            console.log(err)
            return null
        }
    }

    private async loadCommands(dir: string) {
        logger.info(`{loadCommands} Reading commands from ${dir}...`)
        const files = await readdir(dir, { withFileTypes: true })
        logger.info(`{loadCommands} Found ${files.length} files in ${dir}`)
        for (const file of files) {
            if (file.isDirectory()) {
                await this.loadCommands(path.join(dir, file.name))
            } else if (file.isFile() && file.name.endsWith('.ts')) {
                await this.importCommand(file)
            }
        }
        logger.ok(`{loadCommands} Finished loading commands in ${dir}`)
    }

    public async handleInteraction(interaction: CommandInteraction | ContextMenuCommandInteraction): Promise<void> {
        if (!this.initialized) throw new ClassNotInitializedError()
        const matchingCommand = this.findMatchingCommand(interaction)
        if (!matchingCommand) {
            const errorMessage = `Command ${interaction.commandName} not found`
            logger.warn(`{handleInteraction} Unknown command /${interaction.commandName}`)
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
            const guildCommand = this.guildCommands.find(
                command => command.data.name === interaction.commandName && 
                command.guildId === interaction.guildId
            )
            if (guildCommand) return guildCommand

            // Then check global commands
            return this.globalCommands.find(
                command => command.data.name === interaction.commandName
            )
        } else if (interaction.isContextMenuCommand()) {
            return this.contextMenuCommands.find(
                command => command.data.name === interaction.commandName && 
                ((interaction.isUserContextMenuCommand() && command.type === 2) ||
                (interaction.isMessageContextMenuCommand() && command.type === 3))
            )
        }
        return undefined
    }

    private async executeCommand(command: SlashCommand | ContextMenuCommand<2 | 3>, interaction: CommandInteraction | ContextMenuCommandInteraction) {
        if (!command.execute) {
            throw new Error(`Command ${interaction.commandName} does not have an execute method`)
        }

        if (interaction.isChatInputCommand() && CommandHandler.isSlashCommand(command)) {
            await command.execute(interaction)
        } else if (interaction.isContextMenuCommand() && CommandHandler.isContextMenuCommand(command)) {
            if (interaction.isUserContextMenuCommand() && command.type === 2) {
                await (command.execute as (i: UserContextMenuCommandInteraction) => Promise<void>)(interaction)
            } else if (interaction.isMessageContextMenuCommand() && command.type === 3) {
                await (command.execute as (i: MessageContextMenuCommandInteraction) => Promise<void>)(interaction)
            } else {
                throw new Error('Context menu command type mismatch with interaction type')
            }
        } else {
            throw new Error('Command type mismatch with interaction type')
        }
    }

    private handleError(e: Error, interaction: CommandInteraction | ContextMenuCommandInteraction) {
        if (!interaction.deferred) interaction.reply(`❌ Deferred interraction error: \`${e.message}\``)
        else interaction.editReply(`❌ Interaction error: \`${e.message}\``)
        logger.error(`{handleInteraction} Error while executing command ${interaction.commandName}: ${e.message}\n${e.stack}`)
    }

    public async refreshGlobalCommands() {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{refreshGlobalCommands} Refreshing global commands...')
        await this.client.application!.commands.set([
            ...this.globalCommands,
            ...this.contextMenuCommands
        ].map(command => command.data))
    }

    public async refreshGuildCommands(guildId: string) {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info(`{refreshGuildCommands} Refreshing guild commands for ${guildId}...`)
        const guild = await this.client.guilds.fetch(guildId)
        const guildCommands = this.guildCommands.filter(command => command.guildId === guildId)
        await guild.commands.set(guildCommands.map(command => command.data))
    }
    public async refreshAllGuildCommands() {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{refreshAllGuildCommands} Refreshing all guild commands...')
        for (const command of this.guildCommands) {
            await this.refreshGuildCommands(command.guildId)
        }
    }

    public static isSlashCommand = (obj: any): obj is SlashCommand => {
        return obj.data instanceof SlashCommandBuilder
    }
    public static isGuildSlashCommand = (obj: any): obj is GuildSlashCommand => {
        return CommandHandler.isSlashCommand(obj) && 'guildId' in obj
    }
    public static isGlobalSlashCommand = (obj: any): obj is SlashCommand => {
        return CommandHandler.isSlashCommand(obj) && !('guildId' in obj)
    }
    public static isContextMenuCommand = (obj: any): obj is ContextMenuCommand => {
        return obj.data instanceof ContextMenuCommandBuilder && (obj.type === 2 || obj.type === 3)
    }
}

class ClassNotInitializedError extends Error {
    message = 'Command handler has not been initialized! Call init() first'
}
export class MissingPermissionsError extends Error {
    permissions: PermissionsBitField[]
    constructor(message: string, permissions: PermissionsBitField[]) {
        super(message)
        this.permissions = permissions
    }
}
