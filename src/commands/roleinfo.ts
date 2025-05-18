import { SlashCommand } from '../types/types'
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'

export default {
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Get detailed information about a role.')
        .addRoleOption(ro => ro
            .setName('role')
            .setDescription('The role to get information about')
            .setRequired(true)
        ),
    async execute(context) {
        if (!context.guild) {
            await context.reply('❌ This command can only be used in a server!')
        }

        const role = await context.getRoleOption('role', true)

        const embed = new EmbedBuilder()
            .setColor(role.color)
            .setTitle(`Role Information: ${role.name}`)
            .addFields(
                { name: 'Role ID', value: role.id, inline: true },
                { name: 'Color', value: `#${role.color.toString(16).padStart(6, '0')}`, inline: true },
                { name: 'Position', value: role.position.toString(), inline: true },
                { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                { name: 'Managed', value: role.managed ? 'Yes' : 'No', inline: true },
                { name: 'Created At', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`, inline: false },
                { name: 'Member Count', value: role.members.size.toString(), inline: true }
            )
            .setTimestamp()

        await context.reply({
            embeds: [embed]
        })
    }
} satisfies SlashCommand
