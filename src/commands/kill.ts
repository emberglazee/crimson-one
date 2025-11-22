import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import path from 'path'

export default {
    data: new SlashCommandBuilder()
        .setName('kill')
        .setDescription('Sends the "YES! KILL!" meme from Family Feud.')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        await ctx.deferReply()
        await ctx.editReply({
            files: [{
                attachment: path.resolve('./data/KILL.mov'),
                name: 'KILL.mov'
            }]
        })
    }
} satisfies SlashCommand
