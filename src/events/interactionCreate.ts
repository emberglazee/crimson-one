import { Client } from 'discord.js'
import { Logger } from '../util/logger'
import CommandHandler from '../modules/CommandManager'
import CrimsonChat from '../modules/CrimsonChat'
import chalk from 'chalk'
const logger = Logger.new('event.interactionCreate')

export default function onInteractionCreate(client: Client) {
    client.on('interactionCreate', async interaction => {
        const commandHandler = CommandHandler.getInstance()
        if (!interaction.isChatInputCommand() && !interaction.isUserContextMenuCommand() && !interaction.isMessageContextMenuCommand()) {
            if (interaction.isRepliable()) await interaction.reply(`⚠️ Unhandled interaction type ${interaction.type}`)
            return
        }

        // Track command usage in CrimsonChat channel if it's a slash command
        if (interaction.isChatInputCommand() && interaction.channelId === '1335992675459141632') {
            const crimsonChat = CrimsonChat.getInstance()
            await crimsonChat.trackCommandUsage(interaction)
        }

        commandHandler.handleInteraction(interaction).catch(err => {
            logger.warn(`Error while handling interaction!\n${chalk.red(err.stack)}`)
        })
    })
}
