import { Logger, yellow, red } from '../../util/logger'
const logger = new Logger('CommandHotReloader')

import fs from 'fs'
import path from 'path'
import { CommandRegistry } from './CommandRegistry'
import { CommandDeployer } from './CommandDeployer'
import { SlashCommand, ContextMenuCommand, GuildSlashCommand } from '../../types'

export class CommandHotReloader {
    private watcher: fs.FSWatcher | null = null
    private commandDir: string
    private registry: CommandRegistry
    private deployer: CommandDeployer
    private debounceTimeout: NodeJS.Timeout | null = null

    constructor(registry: CommandRegistry, deployer: CommandDeployer) {
        this.registry = registry
        this.deployer = deployer
        this.commandDir = path.join(__dirname, '../../commands')
    }

    public start() {
        if (this.watcher) {
            logger.warn('Watcher is already running.')
            return
        }

        logger.info(`Starting to watch for command changes in ${yellow(this.commandDir)}`)
        this.watcher = fs.watch(this.commandDir, { recursive: true }, (eventType, filename) => {
            if (filename && (filename.endsWith('.ts') || filename.endsWith('.js'))) {
                if (this.debounceTimeout) clearTimeout(this.debounceTimeout)
                this.debounceTimeout = setTimeout(() => {
                    logger.info(`Detected ${eventType} in ${yellow(filename)}. Debouncing for 300ms...`)
                    this.handleFileChange(filename)
                }, 300)
            }
        })

        this.watcher.on('error', error => {
            logger.error(`Watcher error: ${red(error.message)}`)
        })
    }

    public stop() {
        if (this.watcher) {
            this.watcher.close()
            this.watcher = null
            logger.info('Stopped watching for command changes.')
        }
    }

    private async handleFileChange(filename: string) {
        const commandPath = path.join(this.commandDir, filename)
        try {
            // Bust the import cache to get the new version
            delete require.cache[require.resolve(commandPath)]
            logger.info(`Reloading command file: ${yellow(commandPath)}`)

            const oldCommand = this.findCommandByPath(commandPath)
            if (oldCommand) {
                this.unloadCommand(oldCommand)
            }

            const newModule = await import(commandPath)
            let reloaded = false
            for (const key in newModule) {
                const exported = newModule[key]
                if (this.isCommand(exported)) {
                    this.loadCommand(exported)
                    reloaded = true
                }
            }

            if (reloaded) {
                logger.ok(`Successfully reloaded commands from ${yellow(filename)}.`)
                await this.deployer.refreshGlobalCommands()
                await this.deployer.refreshAllGuildCommands()
            } else {
                logger.warn(`No commands found in reloaded file: ${yellow(filename)}`)
            }
        } catch (error) {
            logger.error(`Failed to reload command from ${yellow(filename)}: ${red((error as Error).message)}`)
        }
    }

    private findCommandByPath(filePath: string): SlashCommand | ContextMenuCommand | undefined {
        const commandName = path.basename(filePath, '.ts')
        return this.registry.globalCommands.get(commandName) ||
               this.findGuildCommand(commandName) ||
               this.registry.contextMenuCommands.get(commandName)
    }

    private findGuildCommand(commandName: string): GuildSlashCommand | undefined {
        for (const guildCommands of this.registry.guildCommands.values()) {
            if (guildCommands.has(commandName)) {
                return guildCommands.get(commandName)
            }
        }
        return undefined
    }

    private unloadCommand(command: SlashCommand | ContextMenuCommand) {
        const commandName = command.data.name
        if (this.registry.isGuildSlashCommand(command)) {
            const guildCommands = this.registry.guildCommands.get(command.guildId)
            if (guildCommands) {
                guildCommands.delete(commandName)
                logger.info(`Unloaded guild command: ${yellow(commandName)} from guild ${yellow(command.guildId)}`)
            }
        } else if (this.registry.isGlobalSlashCommand(command)) {
            this.registry.globalCommands.delete(commandName)
            logger.info(`Unloaded global command: ${yellow(commandName)}`)
        } else if (this.registry.isContextMenuCommand(command)) {
            this.registry.contextMenuCommands.delete(commandName)
            logger.info(`Unloaded context menu command: ${yellow(commandName)}`)
        }
    }

    private loadCommand(command: SlashCommand | ContextMenuCommand) {
        if (this.registry.isGuildSlashCommand(command)) {
            if (!this.registry.guildCommands.has(command.guildId)) {
                this.registry.guildCommands.set(command.guildId, new Map())
            }
            this.registry.guildCommands.get(command.guildId)!.set(command.data.name, command)
            logger.info(`Loaded guild command: ${yellow(command.data.name)} for guild ${yellow(command.guildId)}`)
        } else if (this.registry.isGlobalSlashCommand(command)) {
            this.registry.globalCommands.set(command.data.name, command)
            logger.info(`Loaded global command: ${yellow(command.data.name)}`)
        } else if (this.registry.isContextMenuCommand(command)) {
            this.registry.contextMenuCommands.set(command.data.name, command)
            logger.info(`Loaded context menu command: ${yellow(command.data.name)}`)
        }
    }

    private isCommand(exported: unknown): exported is SlashCommand | ContextMenuCommand {
        return Boolean(exported) && (this.registry.isSlashCommand(exported) || this.registry.isContextMenuCommand(exported))
    }

    public async reloadCommand(commandName: string): Promise<void> {
        const commandPath = path.join(this.commandDir, `${commandName}.ts`)
        try {
            // Check if the file exists
            await fs.promises.access(commandPath, fs.constants.F_OK)

            // Bust the import cache to get the new version
            delete require.cache[require.resolve(commandPath)]
            logger.info(`Reloading specific command file: ${yellow(commandPath)}`)

            const oldCommand = this.findCommandByPath(commandPath)
            if (oldCommand) {
                this.unloadCommand(oldCommand)
            } else {
                logger.warn(`Command ${yellow(commandName)} not found in registry for unloading. Proceeding with load.`)
            }

            const newModule = await import(commandPath)
            let reloaded = false
            for (const key in newModule) {
                const exported = newModule[key]
                if (this.isCommand(exported)) {
                    this.loadCommand(exported)
                    reloaded = true
                }
            }

            if (reloaded) {
                logger.ok(`Successfully reloaded command: ${yellow(commandName)}.`)
                await this.deployer.refreshGlobalCommands()
                await this.deployer.refreshAllGuildCommands()
            } else {
                throw new Error(`No command found in reloaded file: ${yellow(commandName)}.ts`)
            }
        } catch (error) {
            logger.error(`Failed to reload command ${yellow(commandName)}: ${red((error as Error).message)}`)
            throw error
        }
    }
}
