import {
    SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField,
    ContextMenuCommandBuilder, ContextMenuCommandInteraction, Client,
    type SlashCommandSubcommandsOnlyBuilder, CommandInteraction,
    type SlashCommandOptionsOnlyBuilder
} from 'discord.js'
import fs from 'fs'
import { Logger } from '../util/logger'
const logger = Logger.new('CommandManager')
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
    execute!: (interaction: ChatInputCommandInteraction) => Promise<void>;
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
    files: fs.Dirent[] = []
    initialized = false
    client: Client
    constructor(client: Client) {
        this.client = client
    }
    async init() {
        const initStartTime = Date.now();
        logger.info('{init} Reading the command folder...')
        this.files = await fs.promises.readdir(path.join(esmodules ? path.dirname(fileURLToPath(import.meta.url)) : __dirname, '../commands'), { withFileTypes: true })
        logger.ok(`{init} ${this.files.length} files found`)
        for (const file of this.files) await this.importCommand(file)
        this.initialized = true
        const initEndTime = Date.now();
        const totalTime = (initEndTime - initStartTime) / 1000;
        logger.ok(`{init} Total time to import all commands: ${totalTime}s`)
    }
    async importCommand(file: fs.Dirent) {
        logger.info(`{importCommand} Reading ${file.name}...`)
        const startTime = Date.now()
        try {
            const importedModule = (await import(path.join(esmodules ? path.dirname(fileURLToPath(import.meta.url)) : __dirname, `../commands/${file.name}`)))
            const command: SlashCommand | ContextMenuCommand = importedModule.default;
            if (!command.data) {
                logger.warn(`{importCommand} Command data not found in ${file.name}`)
                return null
            }

            if (CommandHandler.isContextMenuCommand(command)) {
                logger.ok(`{importCommand} Imported context menu command ${command.data.name} from file ${file.name} in ${(Date.now() - startTime) / 1000}s`)
                this.contextMenuCommands.push(command)
                return command
            }

            logger.ok(`{importCommand} Imported /${command.data.name} from file ${file.name} in ${(Date.now() - startTime) / 1000}s`);
            if (CommandHandler.isGlobalSlashCommand(command)) this.globalCommands.push(command)
            return command
        } catch (err) {
            console.log(err)
            return null
        }
    }

    async handleInteraction(interaction: CommandInteraction): Promise<void> {
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
    findMatchingCommand(interaction: CommandInteraction) {
        return (this.globalCommands.find(
                command => command.data.name === interaction.commandName
                && CommandHandler.isGlobalSlashCommand(command)
            ) || this.contextMenuCommands.find(
                command => command.data.name === interaction.commandName
                && CommandHandler.isContextMenuCommand(command)
            )
        )
    }
    async executeCommand(command: SlashCommand | ContextMenuCommand, interaction: CommandInteraction) {
        if (!command.execute) {
            throw new Error(`Command ${interaction.commandName} does not have an execute method`)
        }
        if (interaction.isChatInputCommand() && CommandHandler.isSlashCommand(command)) {
            await command.execute(interaction);
        } else if (interaction.isContextMenuCommand() && CommandHandler.isContextMenuCommand(command)) {
            await command.execute(interaction);
        }
    }
    handleError(e: Error, interaction: CommandInteraction) {
        if (!interaction.deferred) interaction.reply(`❌ Deferred interraction error: \`${e.message}\``)
        else interaction.editReply(`❌ Interaction error: \`${e.message}\``)
        logger.error(`{handleInteraction} Error while executing command ${interaction.commandName}: ${e.message}\n${e.stack}`)
    }
    async refreshGlobalCommands() {
        if (!this.initialized) throw new ClassNotInitializedError()

        logger.info('{refreshGlobalCommands} Refreshing global commands...')
        await this.client.application!.commands.set([...this.globalCommands, ...this.contextMenuCommands].map(command => command.data))
    }
    commandList(guildId?: string) {
        if (!this.initialized) throw new ClassNotInitializedError()
        const commands = [...this.globalCommands]
        return commands
    }
    static isGlobalSlashCommand = (obj: any): obj is SlashCommand => {
        return CommandHandler.isSlashCommand(obj) && !('guildId' in obj)
    }
    static isSlashCommand = (obj: any): obj is SlashCommand => {
        return obj.data instanceof SlashCommandBuilder
    }
    static isContextMenuCommand = (obj: any): obj is ContextMenuCommand => {
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
