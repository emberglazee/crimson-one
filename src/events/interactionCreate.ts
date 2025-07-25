import { Logger, red } from '../util/logger'
const logger = new Logger('event.interactionCreate')

import type { Client } from 'discord.js'
import CommandManager from '../modules/CommandManager/index'

export default function onInteractionCreate(client: Client) {
    client.on('interactionCreate', async interaction => {
        const commandHandler = CommandManager.getInstance()
        if (!interaction.isChatInputCommand() && !interaction.isUserContextMenuCommand() && !interaction.isMessageContextMenuCommand()) {
            if (interaction.isRepliable()) await interaction.reply(`⚠️ Unhandled interaction type ${interaction.type}`)
            return
        }

        commandHandler.handleInteraction(interaction).catch(err => {
            logger.warn(`Error while handling interaction!\n${red(err.stack)}`)
        })
    })
}
