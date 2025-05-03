import { Logger } from '../util/logger'
const logger = new Logger('event.messageCreate')

import type { Client } from 'discord.js'
import util from 'util'
import { screamOnSight } from '..'


export default async function onMessageCreate(client: Client) {
    client.on('messageCreate', async message => {
        try {
            if (message.author === client.user) return
            await screamOnSight.processMessage(message)

            const isMainChannel = message.channel.id === '1335992675459141632'
            const isTestingServer = message.guildId === '1335971145014579263'
            const isMentioned = message.mentions.users.has(client.user!.id)

            if ((isMainChannel || isTestingServer || isMentioned) && message.content.toLowerCase().includes('activation word: ronald mcdonald')) {
                await message.reply('https://cdn.discordapp.com/attachments/1125900471924699178/1303877939049402409/cachedVideo.mov?ex=67a2aff5&is=67a15e75&hm=437bf3939f3eee36a52a0fbf74c379fd25bd9a64db6c4763195266000c9cc8b2&')
                return
            }
        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
