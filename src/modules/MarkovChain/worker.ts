import { parentPort, isMainThread } from 'worker_threads'
import { Logger, red } from '../../util/logger'
const logger = new Logger('MarkovChain | Worker')

import { Client, Guild, Message as DiscordMessage, TextChannel, ChannelType, Collection, IntentsBitField, Partials, User } from 'discord.js'
import { BigramChainBuilder, TrigramChainBuilder } from './entities/MarkovChain'
import { MarkovDataSource } from './DataSource'
import { getChannelMessageCount } from './DiscordUserApi'

if (isMainThread) {
    throw new Error('This file is a worker and should not be run on the main thread.')
}

interface GenerateOptions {
    guildId?: string
    channelId?: string
    user?: User
    userId?: string
    words?: number
    seed?: string
    global?: boolean
    mode?: 'trigram' | 'bigram'
}

interface MessageStatsOptions {
    guildId?: string
    channelId?: string
    user?: User
    userId?: string
    global?: boolean
}

class MarkovEngine {
    private client: Client | null = null
    private dataSource = MarkovDataSource.getInstance()

    async initialize(token: string, userToken?: string) {
        if (this.client) return
        this.client = new Client({
            intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages],
            partials: [Partials.Channel]
        })
        if (userToken) {
            process.env.DISCORD_USER_TOKEN = userToken
        }
        await this.client.login(token)
        await this.dataSource.init()
        logger.ok('Worker client and data source initialized.')
    }

    public async collectMessages(options: {
        guildId: string;
        channelId: string;
        user?: { id: string };
        userId?: string;
        limit?: number | 'entire';
        delayMs?: number;
        disableUserApiLookup?: boolean;
    }) {
        if (!this.client) throw new Error('Worker client not initialized')

        const { guildId: _guildId, channelId, user, userId, limit = 1000, delayMs = 1000, disableUserApiLookup = false } = options

        const channel = await this.client.channels.fetch(channelId) as TextChannel
        if (!channel) throw new Error(`Channel ${channelId} not found.`)

        const messages: DiscordMessage[] = []
        const startTime = Date.now()
        const MAX_RETRIES = 3
        const BATCH_SIZE = 100

        const wasFullyCollected = await this.dataSource.isChannelFullyCollected(channel.guild.id, channel.id)
        const isEntireChannel = limit === 'entire'

        let existingMessageIds: Set<string> = new Set()
        let foundExistingMessage = false

        if (wasFullyCollected) {
            existingMessageIds = await this.dataSource.getExistingMessageIds(channel.guild.id, channel.id)
        }

        let totalMessageCount: number | null = null
        if (isEntireChannel && !user && channel.type === ChannelType.GuildText && !disableUserApiLookup) {
            totalMessageCount = await getChannelMessageCount(this.client, channel.guild.id, channel.id)
        }

        let lastId: string | undefined
        let batchCount = 0
        const numericLimit = isEntireChannel ? Number.MAX_SAFE_INTEGER : (limit as number)

        while (messages.length < numericLimit) {
            if (batchCount > 0) await new Promise(resolve => setTimeout(resolve, delayMs))

            const fetchOptions: { limit: number; before?: string } = {
                limit: Math.min(BATCH_SIZE, isEntireChannel ? BATCH_SIZE : numericLimit - messages.length)
            }
            if (lastId) fetchOptions.before = lastId

            let retries = 0
            let batch: Collection<string, DiscordMessage> | null = null

            while (retries < MAX_RETRIES) {
                try {
                    batch = await channel.messages.fetch(fetchOptions)
                    break
                } catch (error) {
                    retries++
                    if (retries === MAX_RETRIES) throw error
                    await new Promise(resolve => setTimeout(resolve, delayMs * retries))
                }
            }

            if (!batch?.size) break

            let validMessages = user
                ? batch.filter((msg: DiscordMessage) => msg.author.id === user.id && msg.content.length > 0)
                : userId
                    ? batch.filter((msg: DiscordMessage) => msg.author.id === userId && msg.content.length > 0)
                    : batch.filter((msg: DiscordMessage) => msg.content.length > 0)

            if (wasFullyCollected) {
                for (const [id] of validMessages) {
                    if (existingMessageIds.has(id)) {
                        foundExistingMessage = true
                        break
                    }
                }

                if (foundExistingMessage) {
                    validMessages = validMessages.filter(msg => !existingMessageIds.has(msg.id))
                    messages.push(...validMessages.values())
                    break
                }
            }

            messages.push(...validMessages.values())
            lastId = batch.last()?.id
            batchCount++

            const currentTime = Date.now()
            const elapsedTime = currentTime - startTime
            const messagesPerSecond = messages.length / (elapsedTime / 1000)

            let estimatedTimeRemaining: number | null = null
            if (totalMessageCount && isEntireChannel && messagesPerSecond > 0) {
                estimatedTimeRemaining = (totalMessageCount - messages.length) / messagesPerSecond
            } else if (!isEntireChannel && messagesPerSecond > 0) {
                estimatedTimeRemaining = (numericLimit - messages.length) / messagesPerSecond
            }

            const progressEvent = {
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
            parentPort!.postMessage({ type: 'progress', event: 'collectProgress', data: progressEvent })
        }

        if (messages.length > 0) {
            await this.dataSource.addMessages(messages, channel.guild, isEntireChannel ? channel.id : undefined)
        }

        parentPort!.postMessage({
            type: 'progress',
            event: 'collectComplete',
            data: {
                totalCollected: messages.length,
                channelName: channel.name,
                userFiltered: !!user || !!userId,
                entireChannel: isEntireChannel,
                newMessagesOnly: wasFullyCollected,
                totalMessageCount: totalMessageCount || undefined
            }
        })

        return messages.length
    }

    public async generateMessage(options: GenerateOptions) {
        const startTime = Date.now()
        const chain = options.mode === 'bigram' ? new BigramChainBuilder() : new TrigramChainBuilder()

        parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'querying', progress: 0, total: 1, elapsedTime: 0, estimatedTimeRemaining: null } })

        const messages = await this.dataSource.getMessages({
            guild: options.guildId ? { id: options.guildId } as Guild : undefined,
            channel: options.channelId ? { id: options.channelId } as TextChannel : undefined,
            user: options.user,
            userId: options.userId,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'training', progress: 0, total: messages.length, elapsedTime: Date.now() - startTime, estimatedTimeRemaining: null } })

        const CHUNK_SIZE = 1000
        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE)
            for (const msg of chunk) {
                chain.train(msg.text)
            }
            parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'training', progress: Math.min(i + CHUNK_SIZE, messages.length), total: messages.length, elapsedTime: Date.now() - startTime, estimatedTimeRemaining: null } })
        }

        parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'generating', progress: 0, total: 1, elapsedTime: Date.now() - startTime, estimatedTimeRemaining: null } })

        const result = chain.generate({
            minWords: Math.max(3, Math.floor((options.words || 20) * 0.8)),
            maxWords: options.words || 20,
            seed: options.seed ? options.seed.split(/\s+/) : []
        })

        return result
    }

    public async getMessageStats(options: MessageStatsOptions) {
        const startTime = Date.now()
        parentPort!.postMessage({ type: 'progress', event: 'infoProgress', data: { step: 'querying', progress: 0, total: 1, elapsedTime: 0, estimatedTimeRemaining: null } })

        const messages = await this.dataSource.getMessages({
            guild: options.guildId ? { id: options.guildId } as Guild : undefined,
            channel: options.channelId ? { id: options.channelId } as TextChannel : undefined,
            user: options.user,
            userId: options.userId,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        parentPort!.postMessage({ type: 'progress', event: 'infoProgress', data: { step: 'processing', progress: 0, total: messages.length, elapsedTime: Date.now() - startTime, estimatedTimeRemaining: null } })

        const CHUNK_SIZE = 1000
        const uniqueAuthors = new Set<string>()
        const uniqueChannels = new Set<string>()
        const uniqueGuilds = new Set<string>()
        const uniqueWords = new Set<string>()
        let totalWordCount = 0
        let oldestTimestamp: number | null = null
        let newestTimestamp: number | null = null

        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE)
            for (const msg of chunk) {
                uniqueAuthors.add(msg.authorId)
                uniqueChannels.add(msg.channelId)
                uniqueGuilds.add(msg.guildId)
                if (msg.text) {
                    const words = msg.text.split(/\s+/).filter(w => w.length > 0)
                    totalWordCount += words.length
                    for (const word of words) {
                        uniqueWords.add(word.toLowerCase())
                    }
                }
                if (msg.timestamp) {
                    if (oldestTimestamp === null || msg.timestamp < oldestTimestamp) oldestTimestamp = msg.timestamp
                    if (newestTimestamp === null || msg.timestamp > newestTimestamp) newestTimestamp = msg.timestamp
                }
            }
            parentPort!.postMessage({ type: 'progress', event: 'infoProgress', data: { step: 'processing', progress: Math.min(i + CHUNK_SIZE, messages.length), total: messages.length, elapsedTime: Date.now() - startTime, estimatedTimeRemaining: null } })
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

const engine = new MarkovEngine()

parentPort!.on('message', async (message: { type: string; options: unknown; taskId: string }) => {
    try {
        if (message.type === 'initialize') {
            const { token, userToken } = message.options as { token: string, userToken?: string }
            await engine.initialize(token, userToken)
            parentPort!.postMessage({ type: 'result', taskId: message.taskId, data: 'initialized' })
            return
        }

        let result
        switch (message.type) {
            case 'collect':
                result = await engine.collectMessages(message.options as {
                    guildId: string;
                    channelId: string;
                    user?: { id: string };
                    userId?: string;
                    limit?: number | 'entire';
                    delayMs?: number;
                    disableUserApiLookup?: boolean;
                })
                break
            case 'generate':
                result = await engine.generateMessage(message.options as GenerateOptions)
                break
            case 'info':
                result = await engine.getMessageStats(message.options as MessageStatsOptions)
                break
            default:
                throw new Error(`Unknown task type: ${message.type}`)
        }
        parentPort!.postMessage({ type: 'result', taskId: message.taskId, data: result })
    } catch (e) {
        const error = e as Error
        logger.error(`Error in worker task '${message.type}': ${red(error.stack ?? error.message)}`)
        parentPort!.postMessage({ type: 'error', taskId: message.taskId, error: error.message })
    }
})
