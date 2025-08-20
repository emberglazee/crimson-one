import { Logger } from '../util/logger'
const logger = new Logger('/tag')

import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, type PermissionResolvable, InteractionContextType, MessageFlags } from 'discord.js'
import { SlashCommand } from '../types'
import GuildConfigManager from '../modules/GuildConfig'
import { TagManager } from '../modules/TagSystem'
import { relativeDiscordTimestamp } from '../util/functions'
import { CommandContext } from '../modules/CommandManager/CommandContext'

async function hasTagPermission(context: CommandContext<true>): Promise<boolean> {
    logger.debug(`{hasTagPermission} Getting configuration for guild ${context.guild.id}`)
    const guildConfig = await GuildConfigManager.getInstance().getConfig(context.guild.id)

    if (!guildConfig.tagSystemEnabled) {
        logger.debug(`{hasTagPermission} ❌ Tag system disabled for guild ${context.guild.id}`)
        return false
    }

    const member = context.member

    const hasPermission = guildConfig.tagCreatePermissions.some(p => member.permissions.has(p as PermissionResolvable))
    if (hasPermission) {
        logger.debug(`{hasTagPermission} ✅ Member ${member.id} has a permission required for guild ${context.guild.id}`)
        return true
    }

    const hasRole = guildConfig.tagCreateRoles.some(r => member.roles.cache.has(r))
    if (hasRole) {
        logger.debug(`{hasTagPermission} ✅ Member ${member.id} has a role required for guild ${context.guild.id}`)
        return true
    }

    const hasUser = guildConfig.tagCreateUsers.includes(member.id)
    if (hasUser) {
        logger.debug(`{hasTagPermission} ✅ Member ${member.id} is allowed in guild ${context.guild.id}`)
        return true
    }

    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        logger.debug(`{hasTagPermission} ✅ Member ${member.id} has administrator permission in guild ${context.guild.id}`)
        return true
    }

    logger.debug(`{hasTagPermission} ❌ No match, no permission given to ${member.id} in guild ${context.guild.id}`)
    return false
}

export default {
    data: new SlashCommandBuilder()
        .setName('tag')
        .setDescription('Manage server tags')
        .addSubcommand(subcommand => subcommand
            .setName('get')
            .setDescription('Get a tag by name')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('create')
            .setDescription('Create a new tag')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            ).addStringOption(option => option
                .setName('content')
                .setDescription('The content of the tag')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('delete')
            .setDescription('Delete a tag')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('List all tags in the server')
        ).addSubcommand(subcommand => subcommand
            .setName('info')
            .setDescription('Get info about a tag')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            )
        ).setContexts(InteractionContextType.Guild),
    async execute(context: CommandContext<true>) {
        const subcommand = context.getSubcommand(true)
        const guildConfigManager = GuildConfigManager.getInstance()
        const guildConfig = await guildConfigManager.getConfig(context.guild.id)
        const hasPerms = await hasTagPermission(context)

        if (!guildConfig.tagSystemEnabled) {
            await context.reply('The tag system is not enabled on this server. An admin can enable it via `/config tag enable true`.')
            return
        }

        const tagManager = TagManager.getInstance()

        switch (subcommand) {
            case 'get': {
                const name = context.getStringOption('name', true)
                logger.debug(`{get} Getting tag ${name} in guild ${context.guild.id}`)
                const tag = await tagManager.getTag(context.guild.id, name)
                if (tag) {
                    logger.debug(`{get} Found tag ${name} in guild ${context.guild.id}`)
                    await context.reply(tag.content)
                } else {
                    logger.debug(`{get} Tag ${name} not found in guild ${context.guild.id}`)
                    await context.reply({ content: '❌ Tag not found.', flags: MessageFlags.Ephemeral })
                }
                break
            }
            case 'create': {
                const name = context.getStringOption('name', true)
                if (!hasPerms) {
                    logger.debug(`{create} User ${context.user.id} does not have permission to create tags in guild ${context.guild.id}`)
                    await context.reply({ content: '❌ You do not have permission to create tags.', flags: MessageFlags.Ephemeral })
                    return
                }
                if (await tagManager.getTag(context.guild.id, name)) {
                    logger.debug(`{create} Tag ${name} already exists in guild ${context.guild.id}`)
                    await context.reply({ content: '❌ Tag already exists.', flags: MessageFlags.Ephemeral })
                    return
                }
                const content = context.getStringOption('content', true)
                try {
                    logger.debug(`{create} Creating tag ${name} in guild ${context.guild.id}`)
                    await tagManager.createTag(context.guild.id, name, content, context.user.id)
                    logger.debug(`{create} Tag ${name} created in guild ${context.guild.id}`)
                    await context.reply(`✅ Tag ${name} created.`)
                } catch (error) {
                    await context.reply({ content: `❌ ${(error as Error).message}`, flags: MessageFlags.Ephemeral })
                }
                break
            }
            case 'delete': {
                const name = context.getStringOption('name', true)
                const tag = await tagManager.getTag(context.guild.id, name)
                if (!tag) {
                    logger.debug(`{delete} Tag ${name} not found in guild ${context.guild.id}`)
                    await context.reply({ content: '❌ Tag not found.', flags: MessageFlags.Ephemeral })
                    return
                }

                const canDelete = hasPerms || tag.ownerId === context.user.id
                if (!canDelete) {
                    logger.debug(`{delete} User ${context.user.id} has no permission to delete the tag ${name} in ${context.guild.id}`)
                    await context.reply({ content: '❌ You do not have permission to delete this tag.', flags: MessageFlags.Ephemeral })
                    return
                }

                logger.debug(`{delete} Deleting tag ${name} in ${context.guild.id}`)
                await tagManager.deleteTag(context.guild.id, name)
                logger.debug(`{delete} Deleted tag ${name} in ${context.guild.id}`)
                await context.reply(`✅ Tag ${name} deleted.`)
                break
            }
            case 'list': {
                logger.debug(`{list} Listing tags in guild ${context.guild.id}`)
                const tags = await tagManager.listTags(context.guild.id)
                if (tags.length === 0) {
                    logger.debug(`{list} No tags found in guild ${context.guild.id}`)
                    await context.reply('⚠️ There are no tags on this server.')
                    return
                }
                const embed = new EmbedBuilder()
                    .setTitle(`Tags for ${context.guild.name}`)
                    .setDescription(tags.map(t => `\`${t.name}\``).join(', '))
                logger.debug(`{list} Sending list of tags in guild ${context.guild.id}`)
                await context.reply({ embeds: [embed] })
                break
            }
            case 'info': {
                const name = context.getStringOption('name', true)
                logger.debug(`{info} Getting info for tag ${name} in guild ${context.guild.id}`)
                const tag = await tagManager.getTag(context.guild.id, name)
                if (!tag) {
                    logger.debug(`{info} Tag ${name} not found in guild ${context.guild.id}`)
                    await context.reply({ content: '❌ Tag not found.', flags: MessageFlags.Ephemeral })
                    return
                }
                const owner = await context.client.users.fetch(tag.ownerId).catch(() => null)
                const embed = new EmbedBuilder()
                    .setTitle(`Tag Info: ${tag.name}`)
                    .addFields(
                        { name: 'Content', value: tag.content.substring(0, 1024) },
                        { name: 'Owner', value: owner ? `${owner.tag} (${owner.id})` : tag.ownerId, inline: true },
                        { name: 'Created', value: relativeDiscordTimestamp(Math.floor(tag.createdAt.getTime() / 1000)), inline: true }
                    )
                logger.debug(`{info} Sending info for tag ${name} in guild ${context.guild.id}`)
                await context.reply({ embeds: [embed] })
                break
            }
        }
    }
} satisfies SlashCommand
