import { SlashCommand } from '../modules/CommandManager'
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, Role } from 'discord.js'

export default {
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Get detailed information about a role.')
        .addRoleOption(ro => ro
            .setName('role')
            .setDescription('The role to get information about')
            .setRequired(true)
        )
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        const isEphemeral = interaction.options.getBoolean('ephemeral', false)

        if (!interaction.guild) {
            await interaction.reply({
                content: '❌ This command can only be used in a server!',
                flags: isEphemeral ? MessageFlags.Ephemeral : undefined
            })
        }

        const role = interaction.options.getRole('role', true) as Role

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

        await interaction.reply({
            embeds: [embed],
            flags: isEphemeral ? MessageFlags.Ephemeral : undefined
        })
    }
} satisfies SlashCommand
