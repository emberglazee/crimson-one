import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('huh')
        .setDescription('"hUh?" - Dr. House'),
    async execute(ctx) {
        await ctx.deferReply()
        await ctx.editReply({
            files: [{
                attachment: './data/huh.mov',
                name: 'huh.mov'
            }]
        })
    }
} satisfies SlashCommand
