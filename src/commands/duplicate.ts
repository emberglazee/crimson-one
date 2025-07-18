import { Logger, red } from '../util/logger'
const logger = new Logger('/duplicate')

import { SlashCommandBuilder, PermissionsBitField, roleMention, PermissionOverwrites, PermissionFlagsBits, InteractionContextType } from 'discord.js'
import { SlashCommand } from '../types'
import { PING_EMBI } from '../util/constants'

export default {
    data: new SlashCommandBuilder()
        .setName('duplicate')
        .setDescription('Commands to duplicate server items.')
        .addSubcommand(subcommand => subcommand
            .setName('role')
            .setDescription('Create an exact one-to-one replica of a server role.')
            .addRoleOption(option => option
                .setName('role')
                .setDescription('The role to duplicate')
                .setRequired(true)
            ).addStringOption(option => option
                .setName('name')
                .setDescription('The name for the duplicated role')
                .setRequired(true)
            ).addBooleanOption(option => option
                .setName('copy_permissions')
                .setDescription('Copy channel-specific permissions?')
                .setRequired(true)
            )
        ).setContexts(InteractionContextType.Guild),
    async execute(context) {
        if (!context.guild || !context.member) {
            await context.reply(`❌ Are you running the command outside of a server somehow? Please report this to ${PING_EMBI}.`)
            return
        }

        // --- Permission Checks ---
        if (!context.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            await context.reply('❌ You do not have the `Manage Roles` permission to use this command.')
            return
        }

        const botMember = await context.guild.members.fetchMe()
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            await context.reply('❌ I do not have the `Manage Roles` permission. I cannot create or manage roles.')
            return
        }

        const originalRole = await context.getRoleOption('role', true)
        const newRoleName = context.getStringOption('name', true)
        const copyChannelPerms = context.getBooleanOption('copy_permissions', true)

        // --- Sanity Checks ---
        if (originalRole.managed) {
            await context.reply('❌ This role is managed by an integration and cannot be duplicated.')
            return
        }

        if (botMember.roles.highest.position <= originalRole.position) {
            await context.reply(`❌ I cannot duplicate the ${roleMention(originalRole.id)} role because it is higher than or equal to my highest role.`)
            return
        }

        if (copyChannelPerms && !botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            await context.reply('❌ I need the `Manage Channels` permission to copy channel-specific permissions.')
            return
        }

        try {
            // --- Role Creation ---
            const newRole = await context.guild.roles.create({
                name: newRoleName,
                color: originalRole.color,
                hoist: originalRole.hoist,
                mentionable: originalRole.mentionable,
                permissions: originalRole.permissions,
                icon: originalRole.iconURL(),
                unicodeEmoji: originalRole.unicodeEmoji,
                position: originalRole.position, // Set position during creation
                reason: `Duplicated from role: ${originalRole.name} (${originalRole.id}) by ${context.user.tag}`
            })

            // --- Channel Permission Copying ---
            if (copyChannelPerms) {
                const channels = await context.guild.channels.fetch()
                const permissionPromises = []

                for (const channel of channels.values()) {
                    if (!channel || !channel.isTextBased() && !channel.isVoiceBased()) continue

                    const overwrite = channel.permissionOverwrites.resolve(originalRole.id)
                    if (overwrite) {
                        const options = convertOverwriteToOptions(overwrite)
                        permissionPromises.push(channel.permissionOverwrites.create(newRole, options))
                    }
                }
                await Promise.all(permissionPromises)
            }

            await context.editReply(`✅ Successfully duplicated the ${roleMention(originalRole.id)} role as ${roleMention(newRole.id)}.`)

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.warn(`Error duplicating role: ${red(errorMessage)}`)
            await context.editReply(`❌ Failed to duplicate role: \`${errorMessage}\``)
        }
    }
} satisfies SlashCommand

// For correctly casting `PermissionOverwrites` as `PermissionOverwriteOptions`
function convertOverwriteToOptions(overwrite: PermissionOverwrites) {
    const options: Record<string, boolean | null> = {}
    for (const perm of Object.keys(PermissionFlagsBits)) {
        const bit = PermissionFlagsBits[perm as keyof typeof PermissionFlagsBits]
        if (overwrite.allow.has(bit)) {
            options[perm] = true
        } else if (overwrite.deny.has(bit)) {
            options[perm] = false
        }
    }
    return options
}
