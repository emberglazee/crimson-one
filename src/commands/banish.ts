import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types'
import { BanishmentManager } from '../modules/BanishmentManager'

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
            await context.reply({ content: '❌ You dont have permission to manage roles.', ephemeral: true })
            return
        }

        const targetUser = await context.getUserOption('member', true)
        const duration = context.getStringOption('duration')
        const reason = context.getStringOption('reason') ?? 'No reason provided.'

        const targetMember = await context.guild.members.fetch(targetUser).catch(() => null)
        if (!targetMember) {
            await context.reply({ content: `❌ Could not find the specified member.`, ephemeral: true })
            return
        }

        if (targetMember.id === context.user.id) {
            await context.reply({ content: `play stupid games win stupid prizes`, ephemeral: true })
            return
        }

        const banishmentManager = BanishmentManager.getInstance()

        try {
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
