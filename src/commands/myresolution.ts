import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import path from 'path'

export default {
    data: new SlashCommandBuilder()
        .setName('myresolution')
        .setDescription('Sends the "my resolution" meme.')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        await ctx.deferReply()
        await ctx.reply({
            files: [{
                attachment: path.resolve('./data/my resolution.mp4'),
                name: 'my resolution.mp4'
            }]
        })
    }
} satisfies SlashCommand
