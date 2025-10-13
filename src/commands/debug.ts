import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Toggles debug mode (bot owner only).')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        if (!(await ctx.checkEmbi())) return

        const newDebugState = ctx.botSettingsManager.toggleDebugMode()
        await ctx.reply(`ℹ️ Debug mode is now **${newDebugState ? '✅ enabled' : '❌ disabled'}**.`)
    }
} satisfies SlashCommand
