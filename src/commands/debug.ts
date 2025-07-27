import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { BotSettings } from '../modules/BotSettings'

export default {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Toggle debug mode (owner only)'),
    async execute(context) {
        if (!context.isEmbi) {
            await context.reply('❌ You, solely, are responsible for this.')
            return
        }

        const newDebugState = BotSettings.toggleDebugMode()
        await context.reply(`✅ Debug mode is now ${newDebugState ? 'ENABLED' : 'DISABLED'}.`)
    }
} satisfies SlashCommand
