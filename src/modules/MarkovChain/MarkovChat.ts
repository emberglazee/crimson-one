import { Client, Guild, Message as DiscordMessage, TextChannel, User } from 'discord.js'
import { EventEmitter } from 'tseep'
import { ChainBuilder } from './entities'
import { DataSource } from './DataSource'
import { Logger } from '../../util/logger'
import chalk from 'chalk'

const logger = Logger.new('MarkovChain.Chat')

interface MarkovGenerateOptions {
    guild?: Guild
    channel?: TextChannel
    user?: User
    words?: number
    seed?: string
    global?: boolean
}

interface MarkovCollectProgressEvent {
    batchNumber: number
    messagesCollected: number
    totalCollected: number
    limit: number
    percentComplete: number
    channelName: string
}

interface MessageStats {
    messageCount: number
    authorCount: number
    channelCount: number
    guildCount: number
    totalWordCount: number
    uniqueWordCount: number
    avgWordsPerMessage: number
    oldestMessageTimestamp: number | null
    newestMessageTimestamp: number | null
}

export class MarkovChat extends EventEmitter<{
    collectProgress: (event: MarkovCollectProgressEvent) => void
    collectComplete: (event: { totalCollected: number; channelName: string; userFiltered: boolean }) => void
}> {
    private static instance: MarkovChat
    private client: Client | null = null
    private dataSource = DataSource.getInstance()

    private constructor() {
        super()
    }

    public static getInstance(): MarkovChat {
        if (!MarkovChat.instance) {
            MarkovChat.instance = new MarkovChat()
        }
        return MarkovChat.instance
    }

    public setClient(client: Client) {
        this.client = client
    }

    public async collectMessages(channel: TextChannel, options: {
        user?: User
        limit?: number
        delayMs?: number
    } = {}) {
        if (!this.client) throw new Error('Client not set')

        const { user, limit = 1000, delayMs = 1000 } = options
        const messages: DiscordMessage[] = []

        let lastId: string | undefined
        let batchCount = 0

        while (messages.length < limit) {
            if (batchCount > 0) {
                logger.info(`Waiting ${chalk.yellow(delayMs)}ms before next batch...`)
                await Bun.sleep(delayMs)
            }

            const fetchOptions: { limit: number; before?: string } = {
                limit: Math.min(100, limit - messages.length)
            }
            if (lastId) fetchOptions.before = lastId

            logger.ok(`Fetching batch #${chalk.yellow(batchCount + 1)} (${chalk.yellow(fetchOptions.limit)} messages)`)
            const batch = await channel.messages.fetch(fetchOptions)
            if (!batch.size) break

            const validMessages = user
                ? batch.filter(msg => msg.author.id === user.id && msg.content.length > 0)
                : batch.filter(msg => msg.content.length > 0)

            messages.push(...validMessages.values())
            lastId = batch.last()?.id
            batchCount++

            // Emit progress event every batch
            const progressEvent: MarkovCollectProgressEvent = {
                batchNumber: batchCount,
                messagesCollected: validMessages.size,
                totalCollected: messages.length,
                limit,
                percentComplete: (messages.length / limit) * 100,
                channelName: channel.name
            }
            this.emit('collectProgress', progressEvent)
        }

        if (messages.length > 0) {
            await this.dataSource.addMessages(messages, channel.guild)
            logger.ok(`Collected ${chalk.yellow(messages.length)} messages from ${chalk.yellow(channel.name)}`)
        }

        // Emit completion event
        this.emit('collectComplete', {
            totalCollected: messages.length,
            channelName: channel.name,
            userFiltered: !!user
        })

        return messages.length
    }

    public async generateMessage(options: MarkovGenerateOptions): Promise<string> {
        const chain = new ChainBuilder()
        const messages = await this.dataSource.getMessages({
            guild: options.guild,
            channel: options.channel,
            user: options.user,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        for (const msg of messages) {
            chain.train(msg.content)
        }

        return chain.generate({
            minWords: Math.max(3, Math.floor((options.words || 20) * 0.8)),
            maxWords: options.words || 20,
            seed: options.seed?.split(/\s+/)
        })
    }

    public async getMessageStats(options: MarkovGenerateOptions): Promise<MessageStats> {
        const messages = await this.dataSource.getMessages({
            guild: options.guild,
            channel: options.channel,
            user: options.user,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        // Process in smaller chunks to avoid stack overflow
        const CHUNK_SIZE = 1000
        const uniqueAuthors = new Set<string>()
        const uniqueChannels = new Set<string>()
        const uniqueGuilds = new Set<string>()
        const uniqueWords = new Set<string>()
        
        let totalWordCount = 0
        let oldestTimestamp: number | null = null
        let newestTimestamp: number | null = null

        // Process messages in chunks to avoid memory issues
        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE)

            // Process each message in the chunk
            for (const msg of chunk) {
                // Add unique identifiers
                uniqueAuthors.add(msg.authorId)
                uniqueChannels.add(msg.channelId)
                if (msg.guildId) uniqueGuilds.add(msg.guildId)

                // Process words
                if (msg.content) {
                    const words = msg.content.split(/\s+/).filter(w => w.length > 0)
                    totalWordCount += words.length
                    
                    // Add unique words (process in batches to avoid stack issues)
                    for (const word of words) {
                        uniqueWords.add(word.toLowerCase())
                    }
                }

                // Update timestamps
                if (msg.timestamp) {
                    if (oldestTimestamp === null || msg.timestamp < oldestTimestamp) {
                        oldestTimestamp = msg.timestamp
                    }
                    if (newestTimestamp === null || msg.timestamp > newestTimestamp) {
                        newestTimestamp = msg.timestamp
                    }
                }
            }
        }

        return {
            messageCount: messages.length,
            authorCount: uniqueAuthors.size,
            channelCount: uniqueChannels.size,
            guildCount: uniqueGuilds.size,
            totalWordCount,
            uniqueWordCount: uniqueWords.size,
            avgWordsPerMessage: messages.length > 0 ? totalWordCount / messages.length : 0,
            oldestMessageTimestamp: oldestTimestamp,
            newestMessageTimestamp: newestTimestamp
        }
    }
}
