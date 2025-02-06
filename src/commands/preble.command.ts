import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('preble')
        .setDescription('Preble.')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        const epheremal = interaction.options.getBoolean('ephemeral', false)
        await interaction.deferReply({
            flags: epheremal ? MessageFlags.Ephemeral : undefined
        })
        await interaction.editReply({
            files: [{
                attachment: './data/preble.wav',
                name: 'preble.wav'
            }]
        })
    }
} satisfies SlashCommand
