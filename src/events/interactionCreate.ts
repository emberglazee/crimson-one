import { Logger } from '../util/logger'
const logger = new Logger('events.interactionCreate')

import { Client } from 'discord.js'
import CommandHandler from '../modules/CommandManager'

import chalk from 'chalk'
const { red } = chalk

export default function onInteractionCreate(client: Client) {
    client.on('interactionCreate', async interaction => {
        const commandHandler = CommandHandler.getInstance()
        if (!interaction.isChatInputCommand() && !interaction.isUserContextMenuCommand() && !interaction.isMessageContextMenuCommand()) {
            if (interaction.isRepliable()) await interaction.reply(`⚠️ Unhandled interaction type ${interaction.type}`)
            return
        }

        commandHandler.handleInteraction(interaction).catch(err => {
            logger.warn(`Error while handling interaction!\n${red(err.stack)}`)
        })
    })
}
