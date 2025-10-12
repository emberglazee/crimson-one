import { Logger, CommandManager } from '../modules'
import { red } from '../util/colors'
const logger = new Logger('event.interactionCreate')

import type { Client } from 'discord.js'

export default function onInteractionCreate(client: Client, commandManager: CommandManager) {
    client.on('interactionCreate', async interaction => {
        if (interaction.isChatInputCommand() || interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand()) {
            commandManager.handleInteraction(interaction).catch(err => {
                logger.warn(`Error while handling interaction:\n${red(err.stack)}`)
            })
        }
        // Other interaction types (buttons, modals, etc.) are intentionally not handled here.
        // They are managed by collectors within the commands that create them.
    })
}
