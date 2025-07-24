import { Logger, yellow, red } from '../../util/logger'
const logger = new Logger('CommandDeployer')

import { Routes, ApplicationCommandOptionType, ApplicationCommandType, REST } from 'discord.js'
import type { RESTPostAPIChatInputApplicationCommandsJSONBody, RESTPostAPIContextMenuApplicationCommandsJSONBody, Client } from 'discord.js'
import type { SlashCommand, ContextMenuCommand, ExplicitAny } from '../../types'
import { CommandRegistry } from './CommandRegistry'

export class CommandDeployer {
    private rest: REST

    constructor(private client: Client, private registry: CommandRegistry) {
        this.rest = new REST().setToken(client.token!)
    }

    public async refreshGlobalCommands() {
        logger.info('{refreshGlobalCommands} Checking for changes...')
        try {
            const commands = [
                ...this.registry.globalCommands.values(),
                ...this.registry.contextMenuCommands.values()
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
        logger.info(`{refreshGuildCommands} Checking for changes in guild ${yellow(guildId)}...`)
        try {
            const guild = await this.client.guilds.fetch(guildId)
            if (!guild) {
                logger.error(`{refreshGuildCommands} Guild ${yellow(guildId)} not found!`)
                return
            }

            const guildCommands = this.registry.guildCommands.get(guildId)
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
        const guilds = [...this.registry.guildCommands.keys()]
        for (const guildId of guilds)
            await this.refreshGuildCommands(guildId)
    }

    public async fetchGlobalCommandIds(): Promise<{ id: string; name: string }[]> {
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
        logger.info('{deleteAllGlobalCommands} Starting deletion of all global commands...')
        try {
            const commands = await this.fetchGlobalCommandIds()

            for (const command of commands) {
                logger.info(`{deleteAllGlobalCommands} Deleting command ${yellow(command.name)} (${yellow(command.id)})`)
                await this.rest.delete(
                    Routes.applicationCommand(this.client.application!.id, command.id)
                )
            }

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
        logger.info(`{deleteAllGuildCommands} Starting deletion of all commands for guild ${yellow(guildId)}...`)
        try {
            const commands = await this.fetchGuildCommandIds(guildId)

            for (const command of commands) {
                logger.info(`{deleteAllGuildCommands} Deleting command ${yellow(command.name)} (${yellow(command.id)}) from guild ${yellow(guildId)}`)
                await this.rest.delete(
                    Routes.applicationGuildCommand(this.client.application!.id, guildId, command.id)
                )
            }

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

    public async deleteAllRegisteredGuildCommands(): Promise<void> {
        const guilds = [...this.registry.guildCommands.keys()]
        for (const guildId of guilds) {
            await this.deleteAllGuildCommands(guildId)
        }
    }

    private normalizeCommandData(data: ExplicitAny): ExplicitAny {
        const normalized = JSON.parse(JSON.stringify(data))

        if (typeof normalized.type === 'number') {
            if (normalized.required === undefined || normalized.required === null) {
                normalized.required = false
            }
        }

        if (normalized.options && Array.isArray(normalized.options)) {
            normalized.options = normalized.options.map((opt: ExplicitAny) => {
                return this.normalizeCommandData(opt)
            })
        } else if (normalized.options === undefined) {
            const isTopLevelCommandContext = typeof normalized.type === 'undefined' && normalized.name
            const isSubcommandOrGroupType = typeof normalized.type === 'number' &&
                (normalized.type === ApplicationCommandOptionType.Subcommand ||
                 normalized.type === ApplicationCommandOptionType.SubcommandGroup)

            if (isTopLevelCommandContext || isSubcommandOrGroupType) {
                normalized.options = []
            }
        }

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

        const localCommandData = commands.map(cmd => {
            const data = this.normalizeCommandData(cmd.data.toJSON())
            if (data.options) {
                data.options = this.sortCommandOptions(data.options)
            }
            return data
        }).sort((a, b) => a.name.localeCompare(b.name))

        const remoteCommandData = remoteCommands.map(cmd => {
            const data = this.normalizeCommandData(JSON.parse(JSON.stringify({ ...cmd })))
            if (data.options) {
                data.options = this.sortCommandOptions(data.options)
            }
            return data
        }).sort((a, b) => a.name.localeCompare(b.name))

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

            const localKeys = Object.keys(local).filter(key =>
                local[key] !== undefined && !ignoredFields.has(key)
            )
            const remoteKeys = Object.keys(remote).filter(key =>
                remote[key] !== undefined && !ignoredFields.has(key)
            )

            const filterDescriptionForContextMenu = (keys: string[], commandType?: number) => {
                if (commandType === ApplicationCommandType.Message || commandType === ApplicationCommandType.User) {
                    return keys.filter(key => key !== 'description')
                }
                return keys
            }

            const effectiveLocalKeys = filterDescriptionForContextMenu(localKeys, local.type)
            const effectiveRemoteKeys = filterDescriptionForContextMenu(remoteKeys, remote.type)

            if (effectiveLocalKeys.length !== effectiveRemoteKeys.length) {
                return false
            }

            return effectiveLocalKeys.every(key => {
                if (!(key in remote)) {
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
}
