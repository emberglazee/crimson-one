import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('huh')
        .setDescription('"hUh?" - Dr. House'),
    async execute(context) {
        await context.deferReply()
        await context.editReply({
            files: [{
                attachment: './data/huh.mov',
                name: 'huh.mov'
            }]
        })
    }
} satisfies SlashCommand
