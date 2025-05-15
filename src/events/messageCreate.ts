import { Logger } from '../util/logger'
const logger = new Logger('event.messageCreate')

import type { Client } from 'discord.js'
import util from 'util'
import { screamOnSight, shapesInc } from '..'

// Toggle this to true to enable duel mode
const ENABLE_DUEL_MODE = true
const DUEL_SHAPES = ['crimson-1', 'neuropade-m5iv']
const DUEL_CHANNEL_ID = '1372567739931037890'

export default async function onMessageCreate(client: Client) {
    // Preload duel shapes and enable duel mode if toggled
    if (ENABLE_DUEL_MODE) {
        await shapesInc.addShapeByUsername(DUEL_SHAPES[0])
        await shapesInc.addShapeByUsername(DUEL_SHAPES[1])
        await shapesInc.enableDuelMode(DUEL_SHAPES[0], DUEL_SHAPES[1], DUEL_CHANNEL_ID)
    }
    client.on('messageCreate', async message => {
        try {
            if (message.author === client.user) return
            await screamOnSight.processMessage(message)

            await shapesInc.handleMessage(message)

        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
