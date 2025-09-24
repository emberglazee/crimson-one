import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('myresolution')
        .setDescription('Sends the "my resolution" meme.'),
    async execute(ctx) {
        await ctx.deferReply()
        await ctx.reply({
            files: [{
                attachment: './data/my resolution.mp4',
                name: 'my resolution.mp4'
            }]
        })
    }
} satisfies SlashCommand
