import { InteractionContextType, PermissionsBitField, SlashCommandBuilder } from 'discord.js'
import { CommandContext } from '../modules'

import { SlashCommand } from '../types'
import { boolToEmoji, dontPing } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure the bot for your server')
        .addSubcommand(subcommand => subcommand
            .setName('prefix')
            .setDescription('Set the prefix for the bot')
            .addStringOption(option => option
                .setName('prefix')
                .setDescription('The prefix for the bot')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('message-trigger')
            .setDescription('Toggle the message trigger feature')
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Whether to enable the message trigger feature')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('get')
            .setDescription('Get the current configuration for the server')
        ).addSubcommandGroup(group => group
            .setName('tag')
            .setDescription('Configure the tag system')
            .addSubcommand(subcommand => subcommand
                .setName('enable')
                .setDescription('Enable or disable the tag system')
                .addBooleanOption(option => option.setName('enabled').setDescription('Whether to enable the tag system').setRequired(true))
            ).addSubcommand(subcommand => subcommand
                .setName('allow')
                .setDescription('Allow a permission, role, or user to manage tags')
                .addStringOption(option => option
                    .setName('type')
                    .setDescription('The type of entity to allow')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Permission', value: 'permission' },
                        { name: 'Role', value: 'role' },
                        { name: 'User', value: 'user' }
                    )
                )
                .addStringOption(option => option.setName('action').setDescription('Whether to add or remove the permission').setRequired(true).addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
                .addStringOption(option => option.setName('value').setDescription('The permission name, role, or user to allow').setRequired(true))
            ).addSubcommand(subcommand => subcommand
                .setName('status')
                .setDescription('Get the current tag system configuration')
            )
        ).setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    async execute(ctx: CommandContext<true>) {
        const subcommand = ctx.getSubcommand(true)

        if (subcommand !== 'get' && !ctx.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            await ctx.reply('❌ You need the `Manage Server` permission to use this command.')
            return
        }

        await ctx.deferReply()

        const guildConfigManager = ctx.guildConfigManager
        const guildId = ctx.guild.id

        if (subcommand === 'prefix') {

            const prefix = ctx.getStringOption('prefix', true)
            const guildConfig = await guildConfigManager.getConfig(guildId)
            guildConfig.prefix = prefix
            await guildConfigManager.setConfig(guildId, guildConfig)
            await ctx.editReply(`✅ Prefix changed to ${prefix}`)

        } else if (subcommand === 'message-trigger') {

            const enabled = ctx.getBooleanOption('enabled', true)
            const guildConfig = await guildConfigManager.getConfig(guildId)
            guildConfig.messageTrigger = enabled
            await guildConfigManager.setConfig(guildId, guildConfig)
            await ctx.editReply(`${boolToEmoji(enabled)} Message trigger has been set to: ${enabled}`)

        } else if (subcommand === 'get') {

            const guildConfig = await guildConfigManager.getConfig(guildId)
            await ctx.editReply(
                `Current configuration for **${ctx.guild.name}**:\n` +
                `- Prefix: ${guildConfig.prefix}` +
                `- Message trigger: ${boolToEmoji(guildConfig.messageTrigger)}`
            )

        }

        const subcommandGroup = ctx.getSubcommandGroup()
        if (subcommandGroup === 'tag') {

            const tagSubcommand = ctx.getSubcommand(true)
            const guildConfig = await guildConfigManager.getConfig(guildId)

            switch (tagSubcommand) {
                case 'enable': {
                    const enabled = ctx.getBooleanOption('enabled', true)
                    guildConfig.tagSystemEnabled = enabled
                    await guildConfigManager.setConfig(guildId, guildConfig)
                    await ctx.editReply(`${boolToEmoji(enabled)} Tag system has been set to: ${enabled}`)
                    break
                }
                case 'allow': {
                    const type = ctx.getStringOption('type', true)
                    const action = ctx.getStringOption('action', true)
                    const value = ctx.getStringOption('value', true)
                    let id: string | undefined

                    if (type === 'permission') {
                        id = value
                    } else if (type === 'role') {
                        const roleMentionMatch = value.match(/^<@&(\d+)>$/)
                        if (roleMentionMatch) {
                            id = roleMentionMatch[1]
                        } else if (/^\d+$/.test(value)) {
                            const role = await ctx.guild.roles.fetch(value).catch(() => null)
                            if (role) {
                                id = role.id
                            } else {
                                await ctx.editReply(`❌ A role with the ID "${value}" was not found.`)
                                return
                            }
                        } else {
                            const role = ctx.guild.roles.cache.find(r => r.name.toLowerCase() === value.toLowerCase())
                            if (role) {
                                id = role.id
                            } else {
                                await ctx.editReply(`❌ Could not find a role with the name "${value}". Please use the role ID or a mention.`)
                                return
                            }
                        }
                    } else if (type === 'user') {
                        const userMentionMatch = value.match(/^<@!?(\d+)>$/)
                        if (userMentionMatch) {
                            id = userMentionMatch[1]
                        } else if (/^\d+$/.test(value)) {
                            const user = await ctx.client.users.fetch(value).catch(() => null)
                            if (user) {
                                id = user.id
                            } else {
                                await ctx.editReply(`❌ A user with the ID \`${value}\` was not found.`)
                                return
                            }
                        } else {
                            try {
                                const members = await ctx.guild.members.fetch({ query: value, limit: 1 })
                                const member = members.first()
                                if (member) {
                                    id = member.id
                                } else {
                                    await ctx.editReply(`❌ Could not find a user with the name \`${value}\`. Please use the user ID or a mention.`)
                                    return
                                }
                            } catch {
                                await ctx.editReply(`❌ An error occurred while trying to find the user \`${value}\`. Please use the user ID or a mention.`)
                                return
                            }
                        }
                    }

                    if (!id) {
                        await ctx.editReply('❌ Invalid value specified.')
                        return
                    }

                    let targetArray: string[] | undefined
                    if (type === 'permission') targetArray = guildConfig.tagCreatePermissions
                    if (type === 'role') targetArray = guildConfig.tagCreateRoles
                    if (type === 'user') targetArray = guildConfig.tagCreateUsers

                    if (!targetArray) {
                        await ctx.editReply('❌ Invalid type specified.')
                        return
                    }

                    const displayValue = type === 'user' ? `<@${id}>` : type === 'role' ? `<@&${id}>` : id

                    if (action === 'add') {
                        if (!targetArray.includes(id)) {
                            targetArray.push(id)
                            await ctx.editReply(dontPing(`✅ Added ${displayValue} to the list of allowed ${type}s.`))
                        } else {
                            await ctx.editReply(dontPing(`❌ ${displayValue} is already in the list of allowed ${type}s.`))
                            return
                        }
                    } else if (action === 'remove') {
                        const index = targetArray.indexOf(id)
                        if (index > -1) {
                            targetArray.splice(index, 1)
                            await ctx.editReply(dontPing(`✅ Removed ${displayValue} from the list of allowed ${type}s.`))
                        } else {
                            await ctx.editReply(dontPing(`❌ ${displayValue} is not in the list of allowed ${type}s.`))
                            return
                        }
                    }

                    await guildConfigManager.setConfig(guildId, guildConfig)
                    break
                }
                case 'status': {
                    const { tagSystemEnabled, tagCreatePermissions, tagCreateRoles, tagCreateUsers } = guildConfig
                    const status = `## Tag System Status for \`${ctx.guild.name}\`\n` +
                        `- Enabled: ${boolToEmoji(tagSystemEnabled)}\n` +
                        '- Allowed:\n' +
                        `  - Permissions: \`${tagCreatePermissions.length > 0 ? tagCreatePermissions.join(', ') : 'None'}\`\n` +
                        `  - Roles: ${tagCreateRoles.length > 0 ? tagCreateRoles.map(id => `<@&${id}>`).join(', ') : 'None'}\n` +
                        `  - Users: ${tagCreateUsers.length > 0 ? tagCreateUsers.map(id => `<@${id}>`).join(', ') : 'None'}`
                    await ctx.editReply(dontPing(status))
                    break
                }
            }
        }
    }
} satisfies SlashCommand
