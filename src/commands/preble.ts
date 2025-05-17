import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('preble')
        .setDescription('Preble.'),
    async execute(context) {
        await context.deferReply()
        await context.editReply({
            files: [{
                attachment: './data/preble.wav',
                name: 'preble.wav'
            }]
        })
    }
} satisfies SlashCommand
