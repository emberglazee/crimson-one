import { Logger } from '../util/logger'
const logger = new Logger('event.messageCreate')

import type { Client } from 'discord.js'
import util from 'util'
import { screamOnSight, shapesInc } from '..'
import GuildConfigManager from '../modules/GuildConfig'
import CommandManager from '../modules/CommandManager'

export default async function onMessageCreate(client: Client) {
    client.on('messageCreate', async message => {
        try {
            if (message.author === client.user) return
            if (await shapesInc.handlePotentialCookieDM(message)) return

            const guildConfig = await GuildConfigManager.getInstance().getConfig(message.guild?.id)
            if (message.content.startsWith(guildConfig.prefix)) {
                await CommandManager.getInstance().handleMessageCommand(message, guildConfig.prefix)
            }
            if (guildConfig.screamOnSight) {
                await screamOnSight.processMessage(message)
            }

            await shapesInc.handleMessage(message)
        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
