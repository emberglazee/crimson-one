import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('kill')
        .setDescription('"YES! KILL!" - Steve Harvey'),
    async execute(ctx) {
        await ctx.deferReply()
        await ctx.editReply({
            files: [{
                attachment: './data/KILL.mov',
                name: 'KILL.mov'
            }]
        })
    }
} satisfies SlashCommand
