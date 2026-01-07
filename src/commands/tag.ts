import { Logger, CommandContext } from '../modules'
const logger = new Logger('/tag')

import { SlashCommandBuilder, EmbedBuilder, InteractionContextType, MessageFlags } from 'discord.js'
import { SlashCommand } from '../types'
import { relativeDiscordTimestamp } from '../util/functions'

import { distance } from 'fastest-levenshtein'

export default {
    data: new SlashCommandBuilder()
        .setName('tag')
        .setDescription('Manages server tags')
        .addSubcommand(subcommand => subcommand
            .setName('get')
            .setDescription('Gets a tag by its name')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('create')
            .setDescription('Creates a new tag')
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
            .setDescription('Deletes a tag')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('remove')
            .setDescription('Alias for `/tag delete`')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('Lists all tags in the server')
        ).addSubcommand(subcommand => subcommand
            .setName('info')
            .setDescription('Gets info about a tag')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('rename')
            .setDescription('Renames an existing tag')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the tag to rename')
                .setRequired(true)
            ).addStringOption(option => option
                .setName('new_name')
                .setDescription('The new name for the tag')
                .setRequired(true)
            )
        ).setContexts(InteractionContextType.Guild),
    async execute(ctx: CommandContext<true>) {
        const subcommand = ctx.getSubcommand(true)

        const guildConfig = await ctx.guildConfigManager.getConfig(ctx.guild.id)

        const tagManager = ctx.tagManager
        logger.debug(`Calling hasTagPermission(); user: ${ctx.member.id}, guild: ${ctx.guild.id}`)
        const hasPerms = await tagManager.canModerateTags(ctx)
        logger.debug(`await tagManager.hasTagPermission(context) -> ${hasPerms}`)

        if (!guildConfig.tagSystemEnabled) {
            await ctx.reply('The tag system is not enabled on this server. An admin can enable it via `/config tag enable true`.')
            return
        }

        switch (subcommand) {
            case 'get': {
                const name = ctx.getStringOption('name', true)
                logger.debug(`{get} Getting tag ${name} in guild ${ctx.guild.id}`)
                const tag = await tagManager.getTag(ctx.guild.id, name)
                if (tag) {
                    logger.debug(`{get} Found tag ${name} in guild ${ctx.guild.id}`)
                    await ctx.reply(tag.content)
                } else {
                    logger.debug(`{get} Tag ${name} not found in guild ${ctx.guild.id}`)

                    const allTags = await tagManager.listTags(ctx.guild.id)
                    if (allTags.length === 0) {
                        await ctx.reply({ content: '❌ A tag with that name was not found.', flags: MessageFlags.Ephemeral })
                        return
                    }

                    const suggestions = allTags
                        .map(t => ({ name: t.name, dist: distance(name, t.name) }))
                        .filter(t => t.dist < 3 && t.dist > 0)
                        .sort((a, b) => a.dist - b.dist)
                        .slice(0, 5)

                    if (suggestions.length > 0) {
                        const suggestionList = suggestions.map(s => `\`${s.name}\``).join(', ')
                        await ctx.reply({
                            content: `❌ A tag with that name was not found. Did you mean one of these?\n${suggestionList}`,
                            flags: MessageFlags.Ephemeral
                        })
                    } else {
                        await ctx.reply({ content: '❌ A tag with that name was not found.', flags: MessageFlags.Ephemeral })
                    }
                }
                break
            }
            case 'create': {
                const name = ctx.getStringOption('name', true)
                if (!hasPerms) {
                    logger.debug(`{create} User ${ctx.user.id} does not have permission to create tags in guild ${ctx.guild.id}`)
                    await ctx.reply({ content: '❌ You do not have permission to create tags.', flags: MessageFlags.Ephemeral })
                    return
                }
                if (await tagManager.getTag(ctx.guild.id, name)) {
                    logger.debug(`{create} Tag ${name} already exists in guild ${ctx.guild.id}`)
                    await ctx.reply({ content: '❌ Tag already exists.', flags: MessageFlags.Ephemeral })
                    return
                }
                const content = ctx.getStringOption('content', true)
                try {
                    logger.debug(`{create} Creating tag ${name} in guild ${ctx.guild.id}`)
                    await tagManager.createTag(ctx.guild.id, name, content, ctx.user.id)
                    logger.debug(`{create} Tag ${name} created in guild ${ctx.guild.id}`)
                    await ctx.reply(`✅ Tag ${name} created.`)
                } catch (error) {
                    await ctx.reply({ content: `❌ ${(error as Error).message}`, flags: MessageFlags.Ephemeral })
                }
                break
            }
            case 'remove':
            case 'delete': {
                const name = ctx.getStringOption('name', true)
                const tag = await tagManager.getTag(ctx.guild.id, name)
                if (!tag) {
                    logger.debug(`{delete} Tag ${name} not found in guild ${ctx.guild.id}`)
                    await ctx.reply({ content: '❌ Tag not found.', flags: MessageFlags.Ephemeral })
                    return
                }

                const canDelete = hasPerms || tag.ownerId === ctx.user.id
                if (!canDelete) {
                    logger.debug(`{delete} User ${ctx.user.id} has no permission to delete the tag ${name} in ${ctx.guild.id}`)
                    await ctx.reply({ content: '❌ You do not have permission to delete this tag.', flags: MessageFlags.Ephemeral })
                    return
                }

                logger.debug(`{delete} Deleting tag ${name} in ${ctx.guild.id}`)
                await tagManager.deleteTag(ctx.guild.id, name)
                logger.debug(`{delete} Deleted tag ${name} in ${ctx.guild.id}`)
                await ctx.reply(`✅ Tag ${name} deleted.`)
                break
            }
            case 'list': {
                logger.debug(`{list} Listing tags in guild ${ctx.guild.id}`)
                const tags = await tagManager.listTags(ctx.guild.id)
                if (tags.length === 0) {
                    logger.debug(`{list} No tags found in guild ${ctx.guild.id}`)
                    await ctx.reply('⚠️ There are no tags on this server.')
                    return
                }
                const embed = new EmbedBuilder()
                    .setTitle(`Tags for ${ctx.guild.name}`)
                    .setDescription(tags.map(t => `\`${t.name}\``).join(', '))
                logger.debug(`{list} Sending list of tags in guild ${ctx.guild.id}`)
                await ctx.reply({ embeds: [embed] })
                break
            }
            case 'info': {
                const name = ctx.getStringOption('name', true)
                logger.debug(`{info} Getting info for tag ${name} in guild ${ctx.guild.id}`)
                const tag = await tagManager.getTag(ctx.guild.id, name)
                if (!tag) {
                    logger.debug(`{info} Tag ${name} not found in guild ${ctx.guild.id}`)
                    await ctx.reply({ content: '❌ Tag not found.', flags: MessageFlags.Ephemeral })
                    return
                }
                const owner = await ctx.client.users.fetch(tag.ownerId).catch(() => null)
                const embed = new EmbedBuilder()
                    .setTitle(`Tag Info: ${tag.name}`)
                    .addFields(
                        { name: 'Content', value: tag.content.substring(0, 1024) },
                        { name: 'Owner', value: owner ? `${owner.tag} (${owner.id})` : tag.ownerId, inline: true },
                        { name: 'Created', value: relativeDiscordTimestamp(Math.floor(tag.createdAt.getTime() / 1000)), inline: true }
                    )
                logger.debug(`{info} Sending info for tag ${name} in guild ${ctx.guild.id}`)
                await ctx.reply({ embeds: [embed] })
                break
            }
            case 'rename': {
                const name = ctx.getStringOption('name', true)
                const newName = ctx.getStringOption('new_name', true)
                const tag = await tagManager.getTag(ctx.guild.id, name)

                if (!tag) {
                    logger.debug(`{rename} Tag ${name} not found in guild ${ctx.guild.id}`)
                    await ctx.reply({ content: '❌ A tag with that name was not found.', flags: MessageFlags.Ephemeral })
                    return
                }

                const canRename = hasPerms || tag.ownerId === ctx.user.id
                if (!canRename) {
                    logger.debug(`{rename} User ${ctx.user.id} has no permission to rename the tag ${name} in ${ctx.guild.id}`)
                    await ctx.reply({ content: '❌ You do not have permission to rename this tag.', flags: MessageFlags.Ephemeral })
                    return
                }

                try {
                    logger.debug(`{rename} Renaming tag ${name} to ${newName} in guild ${ctx.guild.id}`)
                    await tagManager.renameTag(ctx.guild.id, name, newName)
                    logger.debug(`{rename} Renamed tag ${name} to ${newName} in guild ${ctx.guild.id}`)
                    await ctx.reply(`✅ Tag \`${name}\` has been renamed to \`${newName}\`.`)
                } catch (error) {
                    await ctx.reply({ content: `❌ ${(error as Error).message}`, flags: MessageFlags.Ephemeral })
                }
                break
            }
        }
    }
} satisfies SlashCommand
