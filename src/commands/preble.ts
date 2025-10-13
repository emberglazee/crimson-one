import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('preble')
        .setDescription('Sends the "Preble" audio clip.')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
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
