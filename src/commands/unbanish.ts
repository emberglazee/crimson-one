import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types'
import { BanishmentManager } from '../modules/BanishmentManager'

export default {
    data: new SlashCommandBuilder()
        .setName('unbanish')
        .setDescription('Remove the `banished` role from a server member')
        .addUserOption(uo => uo
            .setName('member')
            .setDescription('Server member to unbanish')
            .setRequired(true)
        )
        .addStringOption(so => so
            .setName('reason')
            .setDescription('Reason for the unbanishment.')
            .setRequired(false)
        )
        .setContexts(InteractionContextType.Guild),
    async execute(context) {
        if (!context.member.permissions.has('ManageRoles')) {
            await context.reply({ content: '❌ You dont have permission to manage roles.', ephemeral: true })
            return
        }

        const targetUser = await context.getUserOption('member', true)
        const reason = context.getStringOption('reason') ?? 'No reason provided.'

        const targetMember = await context.guild.members.fetch(targetUser).catch(() => null)
        if (!targetMember) {
            await context.reply({ content: `❌ Could not find the specified member.`, ephemeral: true })
            return
        }

        const banishmentManager = BanishmentManager.getInstance()

        try {
            await context.deferReply()
            await banishmentManager.unbanish(targetMember, context.user, 'command', reason)
            await context.editReply(`✅ Successfully unbanished ${targetMember.user.username}.`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
            await context.editReply(`❌ Failed to unbanish member: ${errorMessage}`)
        }
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
