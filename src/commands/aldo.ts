import { SlashCommand } from '../types'
import { SlashCommandBuilder } from 'discord.js'
import { randomProjectWingmanArticle } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('aldo')
        .setDescription('The wikipedia nerd'),
    async execute(ctx) {
        await ctx.deferReply()
        const url = await randomProjectWingmanArticle().catch(() => '❌ Failed to get article')
        await ctx.editReply(url)
    }
} satisfies SlashCommand
