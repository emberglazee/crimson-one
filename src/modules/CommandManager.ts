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
import chalk from 'chalk'

import { readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { hasProp } from '../util/functions'
const esmodules = !!import.meta.url


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
}
type ContextMenuInteractionType<T extends 2 | 3> = T extends 2
    ? UserContextMenuCommandInteraction
    : MessageContextMenuCommandInteraction

export interface IContextMenuCommand<T extends 2 | 3 = 2 | 3> extends ContextMenuCommandProps<T> {}
export abstract class ContextMenuCommand<T extends 2 | 3 = 2 | 3> implements IContextMenuCommand<T> {
    data!: ContextMenuCommandProps<T>['data']
    type!: ContextMenuCommandProps<T>['type']
    execute!: ContextMenuCommandProps<T>['execute']
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
        logger.ok(`{init} Total time: ${chalk.yellow(totalTime)}s`)
    }

    private async importCommand(file: Dirent) {
        logger.info(`{importCommand} Importing ${chalk.yellow(file.name)}...`)
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
                    logger.ok(`{importCommand} Found ${chalk.yellow(type)} context menu command ${chalk.yellow(command.data.name)}`)
                    command.data.setType(command.type)
                    this.contextMenuCommands.push(command)
                    commands.push(command)
                } else if (CommandHandler.isGuildSlashCommand(command)) {
                    logger.ok(`{importCommand} Found guild slash command /${chalk.yellow(command.data.name)} for guild ${chalk.yellow(command.guildId)}`)
                    this.guildCommands.push(command)
                    commands.push(command)
                } else if (CommandHandler.isGlobalSlashCommand(command)) {
                    logger.ok(`{importCommand} Found slash command /${chalk.yellow(command.data.name)}`)
                    this.globalCommands.push(command)
                    commands.push(command)
                }
            }

            if (commands.length === 0) {
                logger.warn(`{importCommand} No valid commands found in ${chalk.yellow(file.name)}`)
                return null
            }

            logger.ok(`{importCommand} Imported ${chalk.yellow(commands.length)} commands from file ${chalk.yellow(file.name)} in ${chalk.yellow((Date.now() - startTime) / 1000)}s`)
            return commands
        } catch (err) {
            console.log(err)
            return null
        }
    }

    private async loadCommands(dir: string) {
        logger.info(`{loadCommands} Reading commands from ${chalk.yellow(dir)}...`)
        const files = await readdir(dir, { withFileTypes: true })
        logger.info(`{loadCommands} Found ${chalk.yellow(files.length)} files in ${chalk.yellow(dir)}`)
        for (const file of files) {
            if (file.isDirectory()) {
                await this.loadCommands(path.join(dir, file.name))
            } else if (file.isFile() && file.name.endsWith('.ts')) {
                await this.importCommand(file)
            }
        }
        logger.ok(`{loadCommands} Finished loading commands in ${chalk.yellow(dir)}`)
    }

    public async handleInteraction(interaction: CommandInteraction | ContextMenuCommandInteraction): Promise<void> {
        if (!this.initialized) throw new ClassNotInitializedError()
        const matchingCommand = this.findMatchingCommand(interaction)
        if (!matchingCommand) {
            const errorMessage = `Command ${interaction.commandName} not found`
            logger.warn(`{handleInteraction} Unknown command /${chalk.yellow(interaction.commandName)}`)
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

            if (interaction.isChatInputCommand() && CommandHandler.isSlashCommand(command)) {
                await command.execute(interaction, helpers)
            } else if (interaction.isContextMenuCommand() && CommandHandler.isContextMenuCommand(command)) {
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
            logger.warn(`{executeCommand} Error in ${chalk.yellow(command.data.name)} => ${chalk.red(error.message)}`)
            if (error.message === 'Unknown interaction') {
                logger.warn(`{executeCommand} Error is "Unknown interaction", did the interaction time out on Discord's end?`)
                return
            }
            logger.warn(`{executeCommand} Error isn't "Unknown interaction", throwing it again, let "handleError()" deal with it`)
            throw err
        }
    }

    private handleError(e: Error, interaction: CommandInteraction | ContextMenuCommandInteraction) {
        logger.warn(`{handleInteraction} Error in ${chalk.yellow(interaction.commandName)}: ${chalk.red(e.message)}`)
        try {
            if (!interaction.deferred) interaction.reply(`❌ Deferred interraction error: \`${e.message}\``)
            else interaction.editReply(`❌ Interaction error: \`${e.message}\``)
        } catch (err) {
            logger.warn(`{handleInteraction} Could not reply to the interaction to signal the error; did the interaction time out? [${err instanceof Error ? err.message : err}]`)
        }
    }

    public async refreshGlobalCommands() {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{refreshGlobalCommands}...')
        await this.client.application!.commands.set([
            ...this.globalCommands,
            ...this.contextMenuCommands
        ].map(command => command.data))
        logger.ok('{refreshGlobalCommands}')
    }

    public async refreshGuildCommands(guildId: string) {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info(`{refreshGuildCommands}...`)
        const guild = await this.client.guilds.fetch(guildId)
        if (!guild) {
            logger.error(`{refreshGuildCommands} ${chalk.yellow(guildId)}!`)
            return
        }
        logger.info(`{refreshGuildCommands} ${chalk.yellow(guildId)} - ${chalk.yellow(guild.name)}`)
        const guildCommands = this.guildCommands.filter(command => command.guildId === guildId)
        await guild.commands.set(guildCommands.map(command => command.data))
        logger.ok(`{refreshGuildCommands} ${chalk.yellow(guildId)} - ${chalk.yellow(guild.name)}`)
    }
    public async refreshAllGuildCommands() {
        if (!this.initialized) throw new ClassNotInitializedError()
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('{refreshAllGuildCommands}...')
        for (const command of this.guildCommands) {
            await this.refreshGuildCommands(command.guildId)
        }
        logger.ok('{refreshAllGuildCommands}')
    }

    public static isSlashCommand = (obj: unknown): obj is SlashCommand => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return hasProp(obj, 'data') && (obj as any).data instanceof SlashCommandBuilder
    }
    public static isGuildSlashCommand = (obj: unknown): obj is GuildSlashCommand => {
        return (
            CommandHandler.isSlashCommand(obj) &&
            'guildId' in obj &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typeof (obj as any).guildId === 'string'
        )
    }
    public static isGlobalSlashCommand = (obj: unknown): obj is SlashCommand => {
        return (
            CommandHandler.isSlashCommand(obj) &&
            !('guildId' in obj)
        )
    }
    public static isContextMenuCommand = (obj: unknown): obj is ContextMenuCommand => {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'data' in obj &&
            'type' in obj &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (obj as any).data instanceof ContextMenuCommandBuilder &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((obj as any).type === 2 || (obj as any).type === 3)
        )
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
