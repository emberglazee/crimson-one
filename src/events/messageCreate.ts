import { Logger } from '../util/logger'
const logger = new Logger('event.messageCreate')

import type { Client } from 'discord.js'
import util from 'util'
import { screamOnSight, shapesInc } from '..'

export default async function onMessageCreate(client: Client) {
    client.on('messageCreate', async message => {
        try {
            if (message.author === client.user) return
            await screamOnSight.processMessage(message)

            if (message.channel.id === '1335992675459141632') {
                await message.channel.sendTyping()
                let msg = ''
                if (message.reference) {
                    const ref = await message.fetchReference()
                    msg += `> <u>${ref.author.username}</u>: ${ref.content}\n\n`
                }
                msg += `<u>${message.author.username}</u>: ${message.content}`
                const res = await shapesInc.sendMessage(msg)
                await message.reply(res.text)
            }

        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
