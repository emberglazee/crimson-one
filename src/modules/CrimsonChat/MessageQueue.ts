import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | MessageQueue')

import { Message, TextChannel, MessagePayload, type MessageReplyOptions } from 'discord.js'

interface QueuedMessage {
    content: string | MessagePayload | MessageReplyOptions
    channel: TextChannel
    reply?: Message
}

export class MessageQueue {
    private static instance: MessageQueue
    private queue: QueuedMessage[] = []
    private isProcessing: boolean = false
    private readonly DELAY_MS = 1000
    private lastMessageTime = 0

    private constructor() {
        this.startProcessing()
    }

    public static getInstance(): MessageQueue {
        if (!MessageQueue.instance) {
            MessageQueue.instance = new MessageQueue()
        }
        return MessageQueue.instance
    }

    public queueMessage(
        content: string | MessagePayload | MessageReplyOptions,
        channel: TextChannel,
        reply?: Message
    ): void {
        this.queue.push({ content, channel, reply })
        logger.info(`Message queued. Queue length: ${yellow(this.queue.length)}`)
    }

    private async startProcessing(): Promise<void> {
        while (true) {
            if (this.queue.length > 0 && !this.isProcessing) {
                await this.processQueue()
            }
            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            return
        }

        this.isProcessing = true

        try {
            while (this.queue.length > 0) {
                const now = Date.now()
                const timeSinceLastMessage = now - this.lastMessageTime

                if (timeSinceLastMessage < this.DELAY_MS) {
                    await new Promise(resolve => setTimeout(resolve, this.DELAY_MS - timeSinceLastMessage))
                }

                const message = this.queue.shift()!

                try {
                    if (message.reply) {
                        await message.reply.reply(message.content)
                    } else {
                        await message.channel.send(message.content)
                    }
                    this.lastMessageTime = Date.now()
                } catch (error) {
                    logger.error(`Error sending message: ${red(error instanceof Error ? error.message : String(error))}`)
                }
            }
        } finally {
            this.isProcessing = false
        }
    }

    public getQueueLength(): number {
        return this.queue.length
    }
}
