import { Client } from 'discord.js'
import { commandHandler } from '..'
import { Logger } from '../util/logger'
const logger = Logger.new('event.interactionCreate')

export default function onInteractionCreate(client: Client) {
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand() && !interaction.isUserContextMenuCommand() && !interaction.isMessageContextMenuCommand()) {
            if (interaction.isRepliable()) await interaction.reply(`⚠️ Unhandled interaction type ${interaction.type}`)
            return
        }
        commandHandler.handleInteraction(interaction).catch(err => {
            logger.warn(`Error while handling interaction: ${err.message}\n${err.stack}`)
        })
    })
}
