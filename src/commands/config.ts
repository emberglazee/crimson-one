import { InteractionContextType, PermissionsBitField, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import GuildConfigManager from '../modules/GuildConfig'
import { boolToEmoji } from '../util/functions'
import { CommandContext } from '../modules/CommandManager/CommandContext'

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
            .setDescription('Get the current config for the server')
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
                .setDescription('Get the current tag system config')
            )
        ).setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    async execute(context: CommandContext<true>) {
        const subcommand = context.getSubcommand(true)

        if (subcommand !== 'get' && !context.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            await context.reply('❌ You need the `Manage Server` permission to use this command.')
            return
        }

        await context.deferReply()

        const guildConfigManager = GuildConfigManager.getInstance()
        const guildId = context.guild.id

        if (subcommand === 'prefix') {

            const prefix = context.getStringOption('prefix', true)
            const guildConfig = await guildConfigManager.getConfig(guildId)
            guildConfig.prefix = prefix
            await guildConfigManager.setConfig(guildId, guildConfig)
            await context.editReply(`✅ Prefix changed to \`${prefix}\``)

        } else if (subcommand === 'message-trigger') {

            const enabled = context.getBooleanOption('enabled', true)
            const guildConfig = await guildConfigManager.getConfig(guildId)
            guildConfig.messageTrigger = enabled
            await guildConfigManager.setConfig(guildId, guildConfig)
            await context.editReply(`${boolToEmoji(enabled)} Message trigger has been set to: ${enabled}`)

        } else if (subcommand === 'get') {

            const guildConfig = await guildConfigManager.getConfig(guildId)
            await context.editReply(
                `Current config for **${context.guild.name}**:\n` +
                `- Prefix: \`${guildConfig.prefix}\`\n` +
                `- Message trigger: ${boolToEmoji(guildConfig.messageTrigger)}`
            )

        }

        const subcommandGroup = context.getSubcommandGroup()
        if (subcommandGroup === 'tag') {

            const tagSubcommand = context.getSubcommand(true)
            const guildConfig = await guildConfigManager.getConfig(guildId)

            switch (tagSubcommand) {
                case 'enable': {
                    const enabled = context.getBooleanOption('enabled', true)
                    guildConfig.tagSystemEnabled = enabled
                    await guildConfigManager.setConfig(guildId, guildConfig)
                    await context.editReply(`${boolToEmoji(enabled)} Tag system has been set to: ${enabled}`)
                    break
                }
                case 'allow': {
                    const type = context.getStringOption('type', true)
                    const action = context.getStringOption('action', true)
                    const value = context.getStringOption('value', true)
                    let id: string | undefined

                    if (type === 'permission') {
                        id = value
                    } else if (type === 'role') {
                        const roleMentionMatch = value.match(/^<@&(\d+)>$/)
                        if (roleMentionMatch) {
                            id = roleMentionMatch[1]
                        } else if (/^\d+$/.test(value)) {
                            const role = await context.guild.roles.fetch(value).catch(() => null)
                            if (role) {
                                id = role.id
                            } else {
                                await context.editReply(`❌ Role with ID \"${value}\" not found.`)
                                return
                            }
                        } else {
                            const role = context.guild.roles.cache.find(r => r.name.toLowerCase() === value.toLowerCase())
                            if (role) {
                                id = role.id
                            } else {
                                await context.editReply(`❌ Could not find a role with the name \"${value}\". Please use the role ID or mention.`)
                                return
                            }
                        }
                    } else if (type === 'user') {
                        const userMentionMatch = value.match(/^<@!?(\d+)>$/)
                        if (userMentionMatch) {
                            id = userMentionMatch[1]
                        } else if (/^\d+$/.test(value)) {
                            const user = await context.client.users.fetch(value).catch(() => null)
                            if (user) {
                                id = user.id
                            } else {
                                await context.editReply(`❌ User with ID \`${value}\` not found.`)
                                return
                            }
                        } else {
                            try {
                                const members = await context.guild.members.fetch({ query: value, limit: 1 })
                                const member = members.first()
                                if (member) {
                                    id = member.id
                                } else {
                                    await context.editReply(`❌ Could not find a user with the name \`${value}\`. Please use the user ID or mention.`)
                                    return
                                }
                            } catch (e) {
                                await context.editReply(`❌ An error occurred while trying to find user \`${value}\`. Please use the user ID or mention.`)
                                return
                            }
                        }
                    }

                    if (!id) {
                        await context.editReply('❌ Invalid value specified.')
                        return
                    }

                    let targetArray: string[] | undefined
                    if (type === 'permission') targetArray = guildConfig.tagCreatePermissions
                    if (type === 'role') targetArray = guildConfig.tagCreateRoles
                    if (type === 'user') targetArray = guildConfig.tagCreateUsers

                    if (!targetArray) {
                        await context.editReply('❌ Invalid type specified.')
                        return
                    }

                    const displayValue = type === 'user' ? `<@${id}>` : type === 'role' ? `<@&${id}>` : id

                    if (action === 'add') {
                        if (!targetArray.includes(id)) {
                            targetArray.push(id)
                            await context.editReply(dontPing(`✅ Added ${displayValue} to the list of allowed ${type}s.`))
                        } else {
                            await context.editReply(dontPing(`❌ ${displayValue} is already in the list of allowed ${type}s.`))
                            return
                        }
                    } else if (action === 'remove') {
                        const index = targetArray.indexOf(id)
                        if (index > -1) {
                            targetArray.splice(index, 1)
                            await context.editReply(dontPing(`✅ Removed ${displayValue} from the list of allowed ${type}s.`))
                        } else {
                            await context.editReply(dontPing(`❌ ${displayValue} is not in the list of allowed ${type}s.`))
                            return
                        }
                    }

                    await guildConfigManager.setConfig(guildId, guildConfig)
                    break
                }
                case 'status': {
                    const { tagSystemEnabled, tagCreatePermissions, tagCreateRoles, tagCreateUsers } = guildConfig
                    const status = `## Tag System Status for \`${context.guild.name}\`\n` +
                        `- Enabled: ${boolToEmoji(tagSystemEnabled)}\n` +
                        '- Allowed:\n' +
                        `  - Permissions: \`${tagCreatePermissions.length > 0 ? tagCreatePermissions.join(', ') : 'None'}\`\n` +
                        `  - Roles: ${tagCreateRoles.length > 0 ? tagCreateRoles.map(id => `<@&${id}>`).join(', ') : 'None'}\n` +
                        `  - Users: ${tagCreateUsers.length > 0 ? tagCreateUsers.map(id => `<@${id}>`).join(', ') : 'None'}`
                    await context.editReply(dontPing(status))
                    break
                }
            }
        }
    }
} satisfies SlashCommand

const dontPing = (content: string) => ({ content, allowedMentions: { parse: [] } })
