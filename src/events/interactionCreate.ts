import { Logger, CommandManager } from '../modules'
import { red } from '../util/colors'
const logger = new Logger('event.interactionCreate')

import type { Client } from 'discord.js'

export default function onInteractionCreate(client: Client, commandManager: CommandManager) {
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand() && !interaction.isUserContextMenuCommand() && !interaction.isMessageContextMenuCommand()) {
            if (interaction.isRepliable()) await interaction.reply(`⚠️ Unhandled interaction type ${interaction.type}`)
            return
        }

        commandManager.handleInteraction(interaction).catch(err => {
            logger.warn(`Error while handling interaction!\n${red(err.stack)}`)
        })
    })
}
