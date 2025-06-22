import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Pulls the latest commit and restarts the bot.'),
    async execute(context) {
        if (!context.isEmbi) {
            await context.reply('❌ You, solely, are responsible for this.')
            return
        }

        // Check if the bot is managed by the guardian
        if (typeof process.send !== 'function') {
            await context.reply('❌ The bot is not running under the guardian process. Update cannot be performed.')
            return
        }

        await context.reply('✅ Received update request. The guardian will now pull the latest changes and restart the bot...')

        // Send a message to the parent (guardian) process
        process.send({ type: 'UPDATE_REQUEST' })
    }
} satisfies SlashCommand
