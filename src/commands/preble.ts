import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('preble')
        .setDescription('Preble.'),
    async execute(ctx) {
        await ctx.deferReply()
        await ctx.editReply({
            files: [{
                attachment: './data/preble.wav',
                name: 'preble.wav'
            }]
        })
    }
} satisfies SlashCommand
