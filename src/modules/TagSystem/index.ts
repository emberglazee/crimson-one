import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
const logger = new Logger('TagManager')

import { type CommandContext } from '../CommandManager/CommandContext'
import { inspect } from 'bun'
import { ServerConfigManager } from '../ServerConfig'

import { TagDataSource } from './DataSource'
import { Tag, type PlatformType } from './entities/Tag'
import { Message, GuildMember, type PermissionResolvable } from 'discord.js'
import type {
    IPlatformMessage,
    IPlatformServerMember
} from '../../platform/interfaces'

@singleton()
export class TagManager {
    public constructor(
        private dataSource: TagDataSource,
        private serverConfigManager: ServerConfigManager
    ) {}

    public async init() {
        await this.dataSource.init()
    }

    private get repository() {
        if (!this.dataSource.orm) {
            throw new Error(
                'DataSource is not initialized. Call TagManager.init() first.'
            )
        }
        return this.dataSource.orm.getRepository(Tag)
    }

    public async getTag(
        platform: PlatformType,
        serverId: string,
        name: string
    ): Promise<Tag | null> {
        return this.repository.findOne({ where: { platform, serverId, name } })
    }

    public async createTag(
        platform: PlatformType,
        serverId: string,
        name: string,
        content: string,
        ownerId: string
    ): Promise<Tag> {
        const existingTag = await this.getTag(platform, serverId, name)
        if (existingTag) {
            throw new Error(
                'A tag with this name already exists on this server.'
            )
        }

        const newTag = this.repository.create({
            platform,
            serverId,
            name,
            content,
            ownerId
        })
        return this.repository.save(newTag)
    }

    public async deleteTag(
        platform: PlatformType,
        serverId: string,
        name: string
    ): Promise<void> {
        await this.repository.delete({ platform, serverId, name })
    }

    public async renameTag(
        platform: PlatformType,
        serverId: string,
        oldName: string,
        newName: string
    ): Promise<void> {
        const tag = await this.getTag(platform, serverId, oldName)
        if (!tag) {
            throw new Error('A tag with that name was not found.')
        }

        const newNameTagExists = await this.getTag(platform, serverId, newName)
        if (newNameTagExists) {
            throw new Error(`A tag with the name "${newName}" already exists.`)
        }

        tag.name = newName
        await this.repository.save(tag)
    }

    public async listTags(
        platform: PlatformType,
        serverId: string
    ): Promise<Tag[]> {
        return this.repository.find({ where: { platform, serverId } })
    }

    /**
     * Check if a user can moderate tags (create/delete/rename)
     * Works with both Discord CommandContext/Messages and platform messages
     */
    public async canModerateTags(
        ctx: CommandContext | Message | IPlatformMessage
    ): Promise<boolean> {
        // Extract guild/server ID and member from different context types
        let serverId: string | null = null
        let member: IPlatformServerMember | GuildMember | null = null

        if ('server' in ctx) {
            // It's an IPlatformMessage
            serverId = ctx.server?.id || null
            member = ctx.member || null
        } else if ('guild' in ctx) {
            // It's a Discord CommandContext or Message
            serverId = ctx.guild?.id || null
            if ('member' in ctx && ctx.member) {
                // Keep as GuildMember for now
                member = ctx.member as GuildMember
            }
        }

        if (!serverId) {
            logger.debug('{canModerateTags} Context is not in a guild/server.')
            return false
        }

        logger.debug(
            `{canModerateTags} Getting configuration for server ${serverId}`
        )
        const serverConfig = await this.serverConfigManager.getConfig(serverId)
        logger.debug(
            `{canModerateTags} ServerConfig for server ${serverId}:\n${inspect(serverConfig, { colors: true, depth: Infinity })}`
        )

        if (!serverConfig.tagSystemEnabled) {
            logger.debug(
                `{canModerateTags} Tag system disabled for server ${serverId}`
            )
            return false
        }

        if (!member) {
            logger.debug(
                `{canModerateTags} No member found for server ${serverId}`
            )
            return false
        }

        // Check permissions
        let hasPermission = false
        if (member instanceof GuildMember) {
            // Discord GuildMember
            hasPermission = serverConfig.tagCreatePermissions.some(p =>
                member.permissions.has(p as PermissionResolvable)
            )
        } else if ('havePermission' in member) {
            // IPlatformServerMember
            hasPermission = serverConfig.tagCreatePermissions.some(
                (p: bigint | string) => {
                    const permString =
                        typeof p === 'bigint' ? p.toString() : String(p)
                    return (member as IPlatformServerMember).havePermission(
                        permString
                    )
                }
            )
        }

        if (hasPermission) {
            logger.debug(
                `{canModerateTags} Member ${member.id} has a permission required for server ${serverId}`
            )
            return true
        }

        // Check roles
        const roles =
            member instanceof GuildMember
                ? member.roles.cache.map(r => r.id)
                : (member as IPlatformServerMember).roles
        const hasRole = serverConfig.tagCreateRoles.some(r =>
            roles.includes(r)
        )

        if (hasRole) {
            logger.debug(
                `{canModerateTags} Member ${member.id} has a role required for server ${serverId}`
            )
            return true
        }

        // Check specific users
        const hasUser = serverConfig.tagCreateUsers.includes(member.id)
        if (hasUser) {
            logger.debug(
                `{canModerateTags} Member ${member.id} is allowed in server ${serverId}`
            )
            return true
        }

        // Check administrator permission
        let isAdmin = false
        if (member instanceof GuildMember) {
            isAdmin = member.permissions.has('Administrator') // String literal or PermissionResolvable
        } else if ('havePermission' in member) {
            isAdmin = (member as IPlatformServerMember).havePermission(
                'Administrator'
            )
        }

        if (isAdmin) {
            logger.debug(
                `{canModerateTags} Member ${member.id} has administrator permission in server ${serverId}`
            )
            return true
        }

        logger.debug(
            `{canModerateTags} No match, no permission given to ${member.id} in server ${serverId}`
        )
        return false
    }

    /**
     * Execute a tag and return the content
     * Platform-agnostic version
     */
    public async executeTag(
        platform: PlatformType,
        serverId: string,
        name: string
    ): Promise<string | null> {
        const tag = await this.getTag(platform, serverId, name)
        return tag?.content || null
    }
}
