import { Logger } from '../util/logger'
const logger = Logger.new('CommandManager')

import {
    SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField,
    ContextMenuCommandBuilder, ContextMenuCommandInteraction, Client,
    type SlashCommandSubcommandsOnlyBuilder, CommandInteraction,
    type SlashCommandOptionsOnlyBuilder
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

export interface IContextMenuCommand {
    data: ContextMenuCommandBuilder
    type: 'user' | 'message'
    execute: (interaction: ContextMenuCommandInteraction) => Promise<void>
}
export abstract class ContextMenuCommand implements IContextMenuCommand {
    data!: ContextMenuCommandBuilder
    type!: 'user' | 'message'
    execute!: (interaction: ContextMenuCommandInteraction) => Promise<void>
}

export default class CommandHandler {
    globalCommands: SlashCommand[] = []
    contextMenuCommands: ContextMenuCommand[] = []
    files: Dirent[] = []
    initialized = false
    client: Client
    constructor(client: Client) {
        this.client = client
    }
    public async init() {
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
            const importedModule = (await import(path.join(esmodules ? path.dirname(fileURLToPath(import.meta.url)) : __dirname, `../commands/${file.name}`)))
            const command: SlashCommand | ContextMenuCommand = importedModule.default
            if (!command.data) {
                logger.warn(`{importCommand} Command data not found in ${file.name}`)
                return null
            }
            if (!command.execute) {
                logger.warn(`{importCommand} Command execute method not found in ${file.name}`)
                return null
            }

            if (CommandHandler.isContextMenuCommand(command)) {
                logger.ok(`{importCommand} Imported context menu command ${command.data.name} from file ${file.name} in ${(Date.now() - startTime) / 1000}s`)
                this.contextMenuCommands.push(command)
                return command
            }

            logger.ok(`{importCommand} Imported /${command.data.name} from file ${file.name} in ${(Date.now() - startTime) / 1000}s`)
            if (CommandHandler.isGlobalSlashCommand(command)) this.globalCommands.push(command)
            return command
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
            return this.globalCommands.find(
                command => command.data.name === interaction.commandName
                && CommandHandler.isGlobalSlashCommand(command)
            )
        } else if (interaction.isContextMenuCommand()) {
            return this.contextMenuCommands.find(
                command => command.data.name === interaction.commandName
                && CommandHandler.isContextMenuCommand(command)
            )
        }
        return undefined
    }

    private async executeCommand(command: SlashCommand | ContextMenuCommand, interaction: CommandInteraction | ContextMenuCommandInteraction) {
        if (!command.execute) {
            throw new Error(`Command ${interaction.commandName} does not have an execute method`)
        }
        
        if (interaction.isChatInputCommand() && CommandHandler.isSlashCommand(command)) {
            await command.execute(interaction)
        } else if (interaction.isContextMenuCommand() && CommandHandler.isContextMenuCommand(command)) {
            await command.execute(interaction)
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

        logger.info('{refreshGlobalCommands} Refreshing global commands...')
        await this.client.application!.commands.set([...this.globalCommands, ...this.contextMenuCommands].map(command => command.data))
    }
    public static isGlobalSlashCommand = (obj: any): obj is SlashCommand => {
        return CommandHandler.isSlashCommand(obj) && !('guildId' in obj)
    }
    public static isSlashCommand = (obj: any): obj is SlashCommand => {
        return obj.data instanceof SlashCommandBuilder
    }
    public static isContextMenuCommand = (obj: any): obj is ContextMenuCommand => {
        return obj.data instanceof ContextMenuCommandBuilder && ['user', 'message'].includes(obj.type)
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
