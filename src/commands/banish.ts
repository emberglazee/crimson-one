import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types'
import { BanishmentManager } from '../modules/BanishmentManager'
import { parseDuration } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('banish')
        .setDescription('Give a server member the `banished` role')
        .addUserOption(uo => uo
            .setName('member')
            .setDescription('Server member to banish')
            .setRequired(true)
        )
        .addStringOption(so => so
            .setName('duration')
            .setDescription('Duration of the banishment (e.g., "6d 3h 2m" or a specific date). Default is permanent.')
            .setRequired(false)
        )
        .addStringOption(so => so
            .setName('reason')
            .setDescription('Reason for the banishment.')
            .setRequired(false)
        )
        .setContexts(InteractionContextType.Guild),
    async execute(context) {
        if (!context.member.permissions.has('ManageRoles')) {
            await context.reply('❌ You dont have permission to manage roles.')
            return
        }

        const targetUser = await context.getUserOption('member', true)
        const duration = context.getStringOption('duration')
        const reason = context.getStringOption('reason') ?? 'No reason provided.'

        const targetMember = await context.guild.members.fetch(targetUser).catch(() => null)
        if (!targetMember) {
            await context.reply(`❌ Could not find the specified member.`)
            return
        }

        if (targetMember.id === context.user.id) {
            await context.reply(`play stupid games win stupid prizes`)
            return
        }

        if (targetMember.id === context.client.user.id) {
            await context.reply('❌ You cannot banish me.')
            return
        }

        if (!targetMember.manageable) {
            await context.reply('❌ I cannot moderate this user. They may have a higher role than me or I may not have the necessary permissions.')
            return
        }

        if (context.member.roles.highest.position <= targetMember.roles.highest.position) {
            await context.reply('❌ You cannot banish a member with an equal or higher role than you.')
            return
        }

        const banishmentManager = BanishmentManager.getInstance()

        try {
            const durationSec = duration ? parseDuration(duration) : null
            if (durationSec !== null) {
                if (durationSec < 60n) {
                    await context.reply('❌ Minimum banishment duration is 1 minute.')
                    return
                }

                const unbanishTimestamp = BigInt(Date.now()) + durationSec * 1000n
                if (unbanishTimestamp > 8.64e15) {
                    await context.reply('❌ Calculated unbanishment date is beyond `13th of September, year 275760, 12:00:00.000 AM`. why are you like this')
                    return
                }
            }

            await context.deferReply()
            await banishmentManager.banish(targetMember, context.user, 'command', duration, reason)
            await context.editReply(`✅ Successfully banished ${targetMember.user.username}.`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.'
            await context.editReply(`❌ Failed to banish member: ${errorMessage}`)
        }
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
