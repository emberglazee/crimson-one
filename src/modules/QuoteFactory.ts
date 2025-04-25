import { AttachmentBuilder, type Client, type ThreadChannel } from 'discord.js'
import { QuoteImageFactory } from './QuoteImageFactory'
import { readFile } from 'fs/promises'
import path from 'path'
import { quoteImageConfig } from '../util/constants'

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
            if (message.interactionMetadata) return
            if (message.author === this.client.user) return
            try {
                await message.channel.sendTyping()
                const speaker = message.member!.displayName
                const quote = message.content
                const color = message.member!.displayHexColor
                const gradient = 'none'
                const stretchGradient = false
                const factory = QuoteImageFactory.getInstance(quoteImageConfig)
                const result = await factory.createQuoteImage(speaker, quote, color, gradient, stretchGradient, 'pw', false)
                const image = new AttachmentBuilder(result.buffer)
                    .setName(`quote.${result.type === 'image/gif' ? 'gif' : 'png'}`)

                if (message.content.toLowerCase().includes('preble')) {
                    const preble = new AttachmentBuilder(await readFile(path.join(__dirname, '../../data/preble.wav')), { name: 'preble.wav' })
                    await this.thread!.send({ files: [image, preble] })
                    return
                }
                await this.thread!.send({ files: [image] })
                await message.delete()
            } catch (error) {
                console.error('Error processing quote:', error)
                await this.thread!.send(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
        })
    }
}
