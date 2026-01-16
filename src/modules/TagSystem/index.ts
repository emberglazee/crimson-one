import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
const logger = new Logger('TagManager')

import { type CommandContext } from '../CommandManager/CommandContext'
import { inspect } from 'bun'
import { GuildConfigManager } from '../GuildConfig'

import { TagDataSource } from './DataSource'
import { Tag } from './entities/Tag'
import { Message, PermissionsBitField, type PermissionResolvable } from 'discord.js'

@singleton()
export class TagManager {
    public constructor(
        private dataSource: TagDataSource,
        private guildConfigManager: GuildConfigManager
    ) {}

    public async init() {
        await this.dataSource.init()
    }

    private get repository() {
        if (!this.dataSource.orm) {
            throw new Error('DataSource is not initialized. Call TagManager.init() first.')
        }
        return this.dataSource.orm.getRepository(Tag)
    }

    public async getTag(guildId: string, name: string): Promise<Tag | null> {
        return this.repository.findOne({ where: { guildId, name } })
    }

    public async createTag(guildId: string, name: string, content: string, ownerId: string): Promise<Tag> {
        const existingTag = await this.getTag(guildId, name)
        if (existingTag) {
            throw new Error('A tag with this name already exists on this server.')
        }

        const newTag = this.repository.create({ guildId, name, content, ownerId })
        return this.repository.save(newTag)
    }

    public async deleteTag(guildId: string, name: string): Promise<void> {
        await this.repository.delete({ guildId, name })
    }

    public async renameTag(guildId: string, oldName: string, newName: string): Promise<void> {
        const tag = await this.getTag(guildId, oldName)
        if (!tag) {
            throw new Error('A tag with that name was not found.')
        }

        const newNameTagExists = await this.getTag(guildId, newName)
        if (newNameTagExists) {
            throw new Error(`A tag with the name "${newName}" already exists.`)
        }

        tag.name = newName
        await this.repository.save(tag)
    }

    public async listTags(guildId: string): Promise<Tag[]> {
        return this.repository.find({ where: { guildId } })
    }

    public async canModerateTags(ctx: CommandContext | Message): Promise<boolean> {
        if (!ctx.guild) {
            logger.debug('{canModerateTags} CommandContext or Message is not in a guild.')
            return false
        }

        logger.debug(`{canModerateTags} Getting configuration for guild ${ctx.guild.id}`)
        const guildConfig = await this.guildConfigManager.getConfig(ctx.guild.id)
        logger.debug(`{canModerateTags} GuildConfig for guild ${ctx.guild.id}:\n${inspect(guildConfig, { colors: true, depth: Infinity })}`)

        if (!guildConfig.tagSystemEnabled) {
            logger.debug(`{canModerateTags} ❌ Tag system disabled for guild ${ctx.guild.id}`)
            return false
        }

        const member = ctx.member
        if (!member) {
            logger.debug(`{canModerateTags} ❌ No member found for guild ${ctx.guild.id}`)
            return false
        }

        const hasPermission = guildConfig.tagCreatePermissions.some(p => member.permissions.has(p as PermissionResolvable))
        if (hasPermission) {
            logger.debug(`{canModerateTags} ✅ Member ${member.id} has a permission required for guild ${ctx.guild.id}`)
            return true
        }

        const hasRole = guildConfig.tagCreateRoles.some(r => member.roles.cache.has(r))
        if (hasRole) {
            logger.debug(`{canModerateTags} ✅ Member ${member.id} has a role required for guild ${ctx.guild.id}`)
            return true
        }

        const hasUser = guildConfig.tagCreateUsers.includes(member.id)
        if (hasUser) {
            logger.debug(`{canModerateTags} ✅ Member ${member.id} is allowed in guild ${ctx.guild.id}`)
            return true
        }

        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            logger.debug(`{canModerateTags} ✅ Member ${member.id} has administrator permission in guild ${ctx.guild.id}`)
            return true
        }

        logger.debug(`{canModerateTags} ❌ No match, no permission given to ${member.id} in guild ${ctx.guild.id}`)
        return false
    }
}
