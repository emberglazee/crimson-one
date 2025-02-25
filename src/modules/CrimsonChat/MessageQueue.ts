import { Message, TextChannel, MessagePayload, type MessageReplyOptions } from 'discord.js'
import { Logger } from '../../util/logger'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | MessageQueue')

interface QueuedMessage {
    content: string | MessagePayload | MessageReplyOptions
    channel: TextChannel
    reply?: Message
    resolve: (value: Message | null) => void
    reject: (error: Error) => void
}

export class MessageQueue {
    private static instance: MessageQueue
    private queue: QueuedMessage[] = []
    private isProcessing: boolean = false
    private readonly DELAY_MS = 2000 // 2 seconds delay between messages

    private constructor() {}

    public static getInstance(): MessageQueue {
        if (!MessageQueue.instance) {
            MessageQueue.instance = new MessageQueue()
        }
        return MessageQueue.instance
    }

    public async queueMessage(
        content: string | MessagePayload | MessageReplyOptions,
        channel: TextChannel,
        reply?: Message
    ): Promise<Message | null> {
        return new Promise((resolve, reject) => {
            this.queue.push({ content, channel, reply, resolve, reject })
            logger.info(`Message queued. Queue length: ${chalk.yellow(this.queue.length)}`)

            if (!this.isProcessing) {
                this.processQueue()
            }
        })
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return

        this.isProcessing = true

        try {
            while (this.queue.length > 0) {
                const message = this.queue.shift()!

                try {
                    let sentMessage: Message | null = null
                    if (message.reply?.reply) {
                        sentMessage = await message.reply.reply(message.content)
                    } else {
                        sentMessage = await message.channel.send(message.content)
                    }
                    message.resolve(sentMessage)
                } catch (error) {
                    logger.error(`Error sending message: ${chalk.red(error instanceof Error ? error.message : String(error))}`)
                    message.reject(error instanceof Error ? error : new Error(String(error)))
                }

                if (this.queue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.DELAY_MS))
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