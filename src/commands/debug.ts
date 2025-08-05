import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { botSettings } from '../modules/BotSettings'

export default {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Toggle debug mode (owner only)'),
    async execute(context) {
        try { await context.assertEmbi() } catch { return }

        const newDebugState = botSettings.toggleDebugMode()
        await context.reply(`✅ Debug mode is now ${newDebugState ? 'ENABLED' : 'DISABLED'}.`)
    }
} satisfies SlashCommand
