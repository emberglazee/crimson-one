import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types'
import { parseDuration } from '../util/functions'
import { SOLITARY_CONFINEMENT_GUILD_ID } from '../util/constants'

export default {
    data: new SlashCommandBuilder()
        .setName('banish')
        .setDescription('Give a server member the `banished` role')
        .addUserOption(option => option
            .setName('member')
            .setDescription('Server member to banish')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('duration')
            .setDescription('Duration of the banishment (e.g., "6d 3h 2m" or a specific date). Default is permanent.')
            .setRequired(false)
        )
        .addStringOption(option => option
            .setName('reason')
            .setDescription('Reason for the banishment.')
            .setRequired(false)
        )
        .setContexts(InteractionContextType.Guild),
    async execute(ctx) {
        if (!ctx.member.permissions.has('ManageRoles')) {
            await ctx.reply('❌ You dont have permission to manage roles.')
            return
        }

        const targetUser = await ctx.getUserOption('member', true)
        const duration = ctx.getStringOption('duration')
        const reason = ctx.getStringOption('reason') ?? 'No reason provided.'

        const targetMember = await ctx.guild.members.fetch(targetUser).catch(() => null)
        if (!targetMember) {
            await ctx.reply('❌ Could not find the specified member.')
            return
        }

        if (targetMember.id === ctx.user.id) {
            await ctx.reply('play stupid games win stupid prizes')
            return
        }

        if (targetMember.id === ctx.client.user.id) {
            await ctx.reply('❌ You cannot banish me.')
            return
        }

        if (!targetMember.manageable) {
            await ctx.reply('❌ I cannot moderate this user. They may have a higher role than me or I may not have the necessary permissions.')
            return
        }

        if (ctx.member.roles.highest.position <= targetMember.roles.highest.position) {
            await ctx.reply('❌ You cannot banish a member with an equal or higher role than you.')
            return
        }

        try {
            const durationSec = duration ? parseDuration(duration) : null
            if (durationSec !== null) {
                if (durationSec < 60n) {
                    await ctx.reply('❌ Minimum banishment duration is 1 minute.')
                    return
                }

                const unbanishTimestamp = BigInt(Date.now()) + durationSec * 1000n
                if (unbanishTimestamp > 8.64e15) {
                    await ctx.reply('❌ Calculated unbanishment date is beyond `13th of September, year 275760, 12:00:00.000 AM`. why are you like this')
                    return
                }
            }

            await ctx.deferReply()
            await ctx.banishmentManager.banish(targetMember, ctx.user, 'command', duration, reason)
            await ctx.editReply(`✅ Successfully banished ${targetMember.user.username}.`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
            await ctx.editReply(`❌ Failed to banish member: ${errorMessage}`)
        }
    },
    guildId: SOLITARY_CONFINEMENT_GUILD_ID
} satisfies GuildSlashCommand
