import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types'
import { SOLITARY_CONFINEMENT_GUILD_ID } from '../util/constants'

export default {
    data: new SlashCommandBuilder()
        .setName('unbanish')
        .setDescription('Remove the `banished` role from a server member')
        .addUserOption(option => option
            .setName('member')
            .setDescription('Server member to unbanish')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('reason')
            .setDescription('Reason for the unbanishment.')
            .setRequired(false)
        )
        .setContexts(InteractionContextType.Guild),
    async execute(ctx) {
        if (!ctx.member.permissions.has('ManageRoles')) {
            await ctx.reply('❌ You dont have permission to manage roles.')
            return
        }

        const targetUser = await ctx.getUserOption('member', true)
        const reason = ctx.getStringOption('reason') ?? 'No reason provided.'

        const targetMember = await ctx.guild.members.fetch(targetUser).catch(() => null)
        if (!targetMember) {
            await ctx.reply('❌ Could not find the specified member.')
            return
        }

        if (targetMember.id === ctx.user.id) {
            await ctx.reply('how are you banished in the first place?')
            return
        }

        if (targetMember.id === ctx.client.user.id) {
            await ctx.reply('...what')
            return
        }

        if (!targetMember.manageable) {
            await ctx.reply('❌ I cannot moderate this user. They may have a higher role than me or I may not have the necessary permissions.')
            return
        }

        if (ctx.member.roles.highest.position <= targetMember.roles.highest.position) {
            await ctx.reply('❌ You cannot unbanish a member with an equal or higher role than you.')
            return
        }

        try {
            await ctx.deferReply()
            await ctx.banishmentManager.unbanish(targetMember, ctx.user, 'command', reason)
            await ctx.editReply(`✅ Successfully unbanished ${targetMember.user.username}.`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
            await ctx.editReply(`❌ Failed to unbanish member: ${errorMessage}`)
        }
    },
    guildId: SOLITARY_CONFINEMENT_GUILD_ID
} satisfies GuildSlashCommand
