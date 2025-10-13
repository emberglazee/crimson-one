import { SlashCommand } from '../types'
import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { randomProjectWingmanArticle } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('aldo')
        .setDescription('Responds with a random Project Wingman wiki article.')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        await ctx.deferReply()
        const url = await randomProjectWingmanArticle().catch(() => '❌ Failed to get article')
        await ctx.editReply(url)
    }
} satisfies SlashCommand
