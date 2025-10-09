import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Toggles debug mode (owner only).'),
    async execute(ctx) {
        try { await ctx.assertEmbi() } catch { return }

        const newDebugState = ctx.botSettingsManager.toggleDebugMode()
        await ctx.reply(`ℹ️ Debug mode is now **${newDebugState ? '✅ enabled' : '❌ disabled'}**.`)
    }
} satisfies SlashCommand
