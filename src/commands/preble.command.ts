import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('preble')
        .setDescription('Preble.')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute({ deferReply, editReply }, interaction) {
        const epheremal = interaction.options.getBoolean('ephemeral', false)
        await deferReply({
            flags: epheremal ? MessageFlags.Ephemeral : undefined
        })
        await editReply({
            files: [{
                attachment: './data/preble.wav',
                name: 'preble.wav'
            }]
        })
    }
} satisfies SlashCommand
