import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { BotSettingsManager } from '../modules'

export default {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Toggle debug mode (owner only)'),
    async execute(ctx) {
        try { await ctx.assertEmbi() } catch { return }

        const newDebugState = BotSettingsManager.getInstance().toggleDebugMode()
        await ctx.reply(`✅ Debug mode is now ${newDebugState ? 'ENABLED' : 'DISABLED'}.`)
    }
} satisfies SlashCommand
