import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('huh')
        .setDescription('Sends the "hUh?" meme from House M.D.')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
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
