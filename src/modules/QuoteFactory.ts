// This module will "rule over" a specific discord thread, and will do this:
// 1. monitor for any messages sent
// 2. when a message is sent, grab these: message text, author server name and their color
// 3. run it through the same function as in /pwquote (and /ac7quote later on, todo)
// 4. send the image back to the same thread, then delete the original message

import type { Client, ThreadChannel } from 'discord.js'
import { createQuoteImage } from '../util/functions'
import { readFile } from 'fs/promises'
import path from 'path'

export default class QuoteFactory {
    client: Client
    threadId = '1331682390392967329'
    thread: ThreadChannel | null = null
    constructor(client: Client) {
        this.client = client
    }
    async init() {
        this.thread = await this.client.channels.fetch(this.threadId) as ThreadChannel
        this.client.on('messageCreate', async message => {
            if (message.channel.id !== this.threadId) return
            if (message.interactionMetadata && message.interactionMetadata.user === this.client.user) return
            if (message.author === this.client.user) return
            await message.channel.sendTyping()
            const speaker = message.member!.displayName
            const quote = message.content
            const color = message.member!.displayHexColor
            const gradient = 'none'
            const stretchGradient = false
            const image = createQuoteImage(speaker, quote, color, gradient, stretchGradient, 'pw')

            const files = [image]
            if (message.content.includes('preble')) {
                files.push(await readFile(path.join('../../data/preble.wav')))
            }
            await this.thread!.send({ files: [image] })
            // await message.delete()
        })
    }
}
