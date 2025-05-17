import { Logger, yellow } from '../../util/logger'
const logger = new Logger('MarkovChain | Chat')

import { Client, Guild, Message as DiscordMessage, TextChannel, User, ChannelType, Collection } from 'discord.js'
import { EventEmitter } from 'tseep'
import { ChainBuilder, CharacterChainBuilder } from './entities'
import { DataSource } from './DataSource'
import { getChannelMessageCount } from './DiscordUserApi'

interface MarkovGenerateOptions {
    guild?: Guild
    channel?: TextChannel
    user?: User
    userId?: string
    words?: number
    seed?: string
    global?: boolean
    characterMode?: boolean
}

interface MarkovCollectProgressEvent {
    batchNumber: number
    messagesCollected: number
    totalCollected: number
    limit: number | 'entire'
    percentComplete: number
    channelName: string
    startTime: number
    elapsedTime: number
    messagesPerSecond: number
    estimatedTimeRemaining: number | null
}

interface MarkovGenerateProgressEvent {
    step: 'querying' | 'training' | 'generating'
    progress: number
    total: number
    elapsedTime: number
    estimatedTimeRemaining: number | null
}

interface MarkovInfoProgressEvent {
    step: 'querying' | 'processing'
    progress: number
    total: number
    elapsedTime: number
    estimatedTimeRemaining: number | null
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
    collectComplete: (event: { totalCollected: number; channelName: string; userFiltered: boolean; entireChannel: boolean; newMessagesOnly: boolean; totalMessageCount?: number }) => void
    generateProgress: (event: MarkovGenerateProgressEvent) => void
    infoProgress: (event: MarkovInfoProgressEvent) => void
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
        userId?: string
        limit?: number | 'entire'
        delayMs?: number
        disableUserApiLookup?: boolean
    } = {}) {
        if (!this.client) throw new Error('Client not set')

        const { user, userId, limit = 1000, delayMs = 1000, disableUserApiLookup = false } = options
        const messages: DiscordMessage[] = []
        const startTime = Date.now()
        const MAX_RETRIES = 3
        const BATCH_SIZE = 100

        // Check if channel was previously fully collected
        const wasFullyCollected = await this.dataSource.isChannelFullyCollected(channel.guild.id, channel.id)
        const isEntireChannel = limit === 'entire'

        // For previously collected channels, we'll need to track existing message IDs
        let existingMessageIds: Set<string> = new Set()
        let foundExistingMessage = false

        if (wasFullyCollected) {
            // Load existing message IDs for this channel to check for duplicates
            existingMessageIds = await this.dataSource.getExistingMessageIds(channel.guild.id, channel.id)
            logger.info(`Channel was previously fully collected. Checking for ${existingMessageIds.size} existing messages.`)
        }

        // Get total message count from Discord API if collecting entire channel
        let totalMessageCount: number | null = null
        if (isEntireChannel && !user && channel.type === ChannelType.GuildText && !disableUserApiLookup) {
            logger.info(`Attempting to fetch total message count for channel ${yellow(channel.id)}`)
            totalMessageCount = await getChannelMessageCount(this.client, channel.guild.id, channel.id)
            if (totalMessageCount) {
                logger.ok(`Total messages in channel according to Discord API: ${yellow(totalMessageCount)}`)
            } else {
                logger.warn('Could not get message count from Discord API. Progress percentage will not be available.')
            }
        }

        let lastId: string | undefined
        let batchCount = 0
        const numericLimit = isEntireChannel ? Number.MAX_SAFE_INTEGER : (limit as number)

        while (messages.length < numericLimit) {
            if (batchCount > 0) await Bun.sleep(delayMs)

            const fetchOptions: { limit: number; before?: string } = {
                limit: Math.min(BATCH_SIZE, isEntireChannel ? BATCH_SIZE : numericLimit - messages.length)
            }
            if (lastId) fetchOptions.before = lastId

            let retries = 0
            let batch: Collection<string, DiscordMessage> | null = null

            while (retries < MAX_RETRIES) {
                try {
                    logger.info(`Fetching batch #${yellow(batchCount + 1)} (${yellow(fetchOptions.limit)} messages)`)
                    batch = await channel.messages.fetch(fetchOptions)
                    break
                } catch (error) {
                    retries++
                    if (retries === MAX_RETRIES) throw error
                    logger.warn(`Failed to fetch batch, retrying (${retries}/${MAX_RETRIES})...`)
                    await Bun.sleep(delayMs * retries) // Exponential backoff
                }
            }

            if (!batch?.size) break

            let validMessages = user
                ? batch.filter((msg: DiscordMessage) => msg.author.id === user.id && msg.content.length > 0)
                : userId
                    ? batch.filter((msg: DiscordMessage) => msg.author.id === userId && msg.content.length > 0)
                    : batch.filter((msg: DiscordMessage) => msg.content.length > 0)

            // For previously fully collected channels, check for message ID matches
            if (wasFullyCollected) {
                // Check if we've found a message that already exists in our database
                for (const [id] of validMessages) {
                    if (existingMessageIds.has(id)) {
                        logger.info(`Found existing message with ID ${yellow(id)}. Stopping collection.`)
                        foundExistingMessage = true
                        break
                    }
                }

                if (foundExistingMessage) {
                    // Filter out messages that already exist in the database
                    validMessages = validMessages.filter(msg => !existingMessageIds.has(msg.id))
                    // Add remaining new messages and then break
                    messages.push(...validMessages.values())
                    break
                }
            }

            messages.push(...validMessages.values())
            lastId = batch.last()?.id
            batchCount++

            // Calculate ETA stats
            const currentTime = Date.now()
            const elapsedTime = currentTime - startTime
            const messagesPerSecond = messages.length / (elapsedTime / 1000)

            // Calculate estimated time remaining
            let estimatedTimeRemaining: number | null = null
            if (totalMessageCount && isEntireChannel && messagesPerSecond > 0) {
                const remainingMessages = totalMessageCount - messages.length
                estimatedTimeRemaining = remainingMessages / messagesPerSecond
            } else if (!isEntireChannel && messagesPerSecond > 0) {
                const remainingMessages = numericLimit - messages.length
                estimatedTimeRemaining = remainingMessages / messagesPerSecond
            }

            // Emit progress event every batch
            const progressEvent: MarkovCollectProgressEvent = {
                batchNumber: batchCount,
                messagesCollected: validMessages.size,
                totalCollected: messages.length,
                limit,
                percentComplete: totalMessageCount && isEntireChannel ?
                    (messages.length / totalMessageCount) * 100 :
                    isEntireChannel ? 0 : (messages.length / numericLimit) * 100,
                channelName: channel.name,
                startTime,
                elapsedTime,
                messagesPerSecond,
                estimatedTimeRemaining
            }
            this.emit('collectProgress', progressEvent)
        }

        if (messages.length > 0) {
            await this.dataSource.addMessages(messages, channel.guild, isEntireChannel ? channel.id : undefined)
            logger.ok(`Collected ${yellow(messages.length)} messages from ${yellow(channel.name)}${isEntireChannel ? yellow(' (entire channel)') : ''}`)
        }

        // Emit completion event
        this.emit('collectComplete', {
            totalCollected: messages.length,
            channelName: channel.name,
            userFiltered: !!user || !!userId,
            entireChannel: isEntireChannel,
            newMessagesOnly: wasFullyCollected,
            totalMessageCount: totalMessageCount || undefined
        })

        return messages.length
    }

    public async generateMessage(options: MarkovGenerateOptions): Promise<string> {
        const startTime = Date.now()
        // Use character-based or word-based Markov chain
        const chain = options.characterMode ? new CharacterChainBuilder() : new ChainBuilder()

        // Emit progress for querying step
        this.emit('generateProgress', {
            step: 'querying',
            progress: 0,
            total: 1,
            elapsedTime: 0,
            estimatedTimeRemaining: null
        })

        const messages = await this.dataSource.getMessages({
            guild: options.guild,
            channel: options.channel,
            user: options.user,
            userId: options.userId,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        // Emit progress for training step
        this.emit('generateProgress', {
            step: 'training',
            progress: 0,
            total: messages.length,
            elapsedTime: Date.now() - startTime,
            estimatedTimeRemaining: null
        })

        // Process messages in chunks to avoid memory issues and track progress
        const CHUNK_SIZE = 1000
        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE)
            for (const msg of chunk) {
                chain.train(msg.text)
            }

            // Emit progress update
            this.emit('generateProgress', {
                step: 'training',
                progress: Math.min(i + CHUNK_SIZE, messages.length),
                total: messages.length,
                elapsedTime: Date.now() - startTime,
                estimatedTimeRemaining: null
            })
        }

        // Emit progress for generation step
        this.emit('generateProgress', {
            step: 'generating',
            progress: 0,
            total: 1,
            elapsedTime: Date.now() - startTime,
            estimatedTimeRemaining: null
        })

        let result: string
        if (options.characterMode) {
            result = (chain as CharacterChainBuilder).generate({
                minChars: Math.max(5, Math.floor((options.words || 20) * 0.8)),
                maxChars: options.words || 20,
                seed: options.seed ?? ''
            })
        } else {
            result = (chain as ChainBuilder).generate({
                minWords: Math.max(3, Math.floor((options.words || 20) * 0.8)),
                maxWords: options.words || 20,
                seed: options.seed ? options.seed.split(/\s+/) : []
            })
        }

        return result
    }

    public async getMessageStats(options: MarkovGenerateOptions): Promise<MessageStats> {
        const startTime = Date.now()

        // Emit progress for querying step
        this.emit('infoProgress', {
            step: 'querying',
            progress: 0,
            total: 1,
            elapsedTime: 0,
            estimatedTimeRemaining: null
        })

        const messages = await this.dataSource.getMessages({
            guild: options.guild,
            channel: options.channel,
            user: options.user,
            userId: options.userId,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        // Emit progress for processing step
        this.emit('infoProgress', {
            step: 'processing',
            progress: 0,
            total: messages.length,
            elapsedTime: Date.now() - startTime,
            estimatedTimeRemaining: null
        })

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
                uniqueGuilds.add(msg.guildId)

                // Process words
                if (msg.text) {
                    const words = msg.text.split(/\s+/).filter(w => w.length > 0)
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

            // Emit progress update
            this.emit('infoProgress', {
                step: 'processing',
                progress: Math.min(i + CHUNK_SIZE, messages.length),
                total: messages.length,
                elapsedTime: Date.now() - startTime,
                estimatedTimeRemaining: null
            })
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
