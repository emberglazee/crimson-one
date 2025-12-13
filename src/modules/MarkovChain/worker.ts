import 'reflect-metadata'
import { parentPort, isMainThread } from 'worker_threads'

import { REST } from '@discordjs/rest'
import { Routes, type APIChannel, type APIMessage } from 'discord-api-types/v10'

import { RustMarkovChain, type GenerationResult } from './RustChain'
import { MarkovDataSource, type SimplifiedMessage } from './DataSource'
import { container } from 'tsyringe'

if (isMainThread) {
    throw new Error('This file is a worker and should not be run on the main thread.')
}

// Helper to send logs back to the main thread
function log(level: 'debug' | 'info' | 'warn' | 'error', data: string) {
    if (parentPort) {
        parentPort.postMessage({ type: 'log', level, data })
    }
}

interface GenerateOptions {
    guildId?: string
    channelId?: string
    user?: { id: string }
    userId?: string
    words?: number
    seed?: string
    global?: boolean
    mode?: 'trigram' | 'bigram' | 'hybrid'
    batch?: number
}

interface MessageStatsOptions {
    guildId?: string
    channelId?: string
    user?: { id: string }
    userId?: string
    global?: boolean
}

interface DeleteOptions {
    guildId?: string
    channelId?: string
    user?: { id: string }
    userId?: string
    global?: boolean
}

class MarkovEngine {
    private rest: REST | null = null
    private dataSource = container.resolve(MarkovDataSource)
    private dbWriteQueue: Promise<void> = Promise.resolve()
    private persistentChains = new Map<string, RustMarkovChain>()

    public getMessages = this.dataSource.getMessages.bind(this.dataSource)

    async initialize(token: string) {
        if (this.rest) return
        this.rest = new REST({ version: '10' }).setToken(token)
        await this.dataSource.init()
        log('info', 'Worker REST client and data source initialized.')
    }

    private addToDbWriteQueue(messages: SimplifiedMessage[], guildId: string, channelName: string, channelId: string, fullyCollectedChannelId?: string, forceRescan?: boolean): Promise<void> {
        this.dbWriteQueue = this.dbWriteQueue
            .then(() => this.dataSource.addMessages(messages, guildId, channelName, channelId, fullyCollectedChannelId, forceRescan))
            .catch(err => {
                log('error', `A database write operation failed: ${(err as Error).message}`)
                // Even if one write fails, we want the queue to continue with the next item.
                // The error is logged, but the promise chain is not broken.
            })
        return this.dbWriteQueue
    }

    private async _createChainFromDb(options: MessageStatsOptions, taskId: string): Promise<{ chain: RustMarkovChain, dbQueryMs: number, trainingMs: number }> {
        const overallStartTime = performance.now()

        // 1. Querying
        parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'querying', progress: 0, total: 1, elapsedTime: 0, estimatedTimeRemaining: null, taskId } })
        const queryStartTime = performance.now()
        const messages = await this.dataSource.getMessages({
            guildId: options.guildId,
            channelId: options.channelId,
            user: options.user,
            userId: options.userId,
            global: options.global
        })
        const dbQueryMs = performance.now() - queryStartTime

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        // 2. Training
        parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'training', progress: 0, total: messages.length, elapsedTime: performance.now() - overallStartTime, estimatedTimeRemaining: null, taskId } })
        const trainingStartTime = performance.now()
        const rustChain = new RustMarkovChain()
        const simplifiedMessages: SimplifiedMessage[] = messages.map(m => ({
            id: m.id,
            text: m.text,
            authorId: m.authorId,
            channelId: m.channelId,
            timestamp: Number(m.timestamp)
        }))

        const CHUNK_SIZE = 1000
        for (let i = 0; i < simplifiedMessages.length; i += CHUNK_SIZE) {
            const chunk = simplifiedMessages.slice(i, i + CHUNK_SIZE)
            if (chunk.length > 0) {
                rustChain.trainBatch(chunk)
            }
            parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'training', progress: Math.min(i + CHUNK_SIZE, messages.length), total: messages.length, elapsedTime: performance.now() - overallStartTime, estimatedTimeRemaining: null, taskId } })
        }
        const trainingMs = performance.now() - trainingStartTime

        return { chain: rustChain, dbQueryMs, trainingMs }
    }

    public async generateMessage(options: GenerateOptions, taskId: string): Promise<GenerationResult | GenerationResult[] | null> {
        const { chain, dbQueryMs, trainingMs } = await this._createChainFromDb(options, taskId)
        try {
            parentPort!.postMessage({ type: 'progress', event: 'generateProgress', data: { step: 'generating', progress: 0, total: 1, taskId } })
            const result = chain.generate(
                options.words || 30,
                options.mode || 'trigram',
                options.seed,
                dbQueryMs,
                trainingMs,
                options.batch || 1
            )
            return result
        } finally {
            chain.destroy()
        }
    }

    public async createPersistentChain(options: MessageStatsOptions, taskId: string): Promise<string> {
        const { chain } = await this._createChainFromDb(options, taskId)
        const chainId = `persistent-${Date.now()}-${Math.random()}`
        this.persistentChains.set(chainId, chain)
        log('info', `Created and stored persistent chain with ID: ${chainId}`)
        return chainId
    }

    public generateFromPersistentChain(options: { chainId: string, seed?: string, words?: number }): GenerationResult | null {
        const chain = this.persistentChains.get(options.chainId)
        if (!chain) {
            throw new Error(`Persistent chain with ID ${options.chainId} not found.`)
        }
        return chain.generateChatResponse(options.words ?? 30, options.seed ?? '', 0, 0)
    }

    public trainPersistentChain(options: { chainId: string, messages: SimplifiedMessage[] }): void {
        const chain = this.persistentChains.get(options.chainId)
        if (!chain) {
            throw new Error(`Persistent chain with ID ${options.chainId} not found.`)
        }
        chain.trainBatch(options.messages)
    }

    public destroyPersistentChain(chainId: string): void {
        const chain = this.persistentChains.get(chainId)
        if (chain) {
            chain.destroy()
            this.persistentChains.delete(chainId)
            log('info', `Destroyed persistent chain with ID: ${chainId}`)
        }
    }

    public async collectMessages(options: {
        guildId: string
        channelId: string
        user?: { id: string }
        userId?: string
        limit?: number | 'entire'
        delayMs?: number
        forceRescan?: boolean
    }, taskId: string) {
        if (!this.rest) throw new Error('Worker REST client not initialized')

        const { guildId, channelId, user, userId, limit = 1000, delayMs = 1000, forceRescan = false } = options

        const channel = await this.rest.get(Routes.channel(channelId)) as APIChannel
        if (!channel || !channel.name) throw new Error(`Channel ${channelId} not found or has no name.`)


        const messages: APIMessage[] = []
        const startTime = Date.now()
        const MAX_RETRIES = 3
        const BATCH_SIZE = 100

        const wasFullyCollected = forceRescan ? false : await this.dataSource.isChannelFullyCollected(guildId, channel.id)
        let existingMessageIds: Set<string> = new Set()
        let foundExistingMessage = false

        if (wasFullyCollected) {
            existingMessageIds = await this.dataSource.getExistingMessageIds(guildId, channel.id)
        }

        const totalMessageCount: number | null = null
        const isEntireChannel = limit === 'entire'

        let lastId: string | undefined
        let batchCount = 0
        const numericLimit = isEntireChannel ? Number.MAX_SAFE_INTEGER : (limit as number)
        let totalFetched = 0
        let totalIgnored = 0

        while (messages.length < numericLimit) {
            if (batchCount > 0) await new Promise(resolve => setTimeout(resolve, delayMs))

            const fetchOptions: { limit: number, before?: string } = {
                limit: Math.min(BATCH_SIZE, isEntireChannel ? BATCH_SIZE : numericLimit - messages.length)
            }
            if (lastId) fetchOptions.before = lastId

            let retries = 0
            let batch: APIMessage[] | null = null

            while (retries < MAX_RETRIES) {
                try {
                    batch = await this.rest.get(Routes.channelMessages(channelId), { query: new URLSearchParams(fetchOptions as any) }) as APIMessage[]
                    break
                } catch (error) {
                    retries++
                    if (retries === MAX_RETRIES) throw error
                    await new Promise(resolve => setTimeout(resolve, delayMs * retries))
                }
            }

            if (!batch?.length) break

            totalFetched += batch.length

            let validMessages = user
                ? batch.filter(msg => msg.author.id === user.id && msg.content.length > 0)
                : userId
                    ? batch.filter(msg => msg.author.id === userId && msg.content.length > 0)
                    : batch.filter(msg => msg.content.length > 0)

            totalIgnored += batch.length - validMessages.length

            if (wasFullyCollected) {
                for (const msg of validMessages) {
                    if (existingMessageIds.has(msg.id)) {
                        foundExistingMessage = true
                        break
                    }
                }

                if (foundExistingMessage) {
                    validMessages = validMessages.filter(msg => !existingMessageIds.has(msg.id))
                    messages.push(...validMessages)
                    break
                }
            }

            messages.push(...validMessages)
            lastId = batch[batch.length - 1]?.id
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
                messagesCollected: validMessages.length,
                totalCollected: messages.length,
                totalFetched,
                totalIgnored,
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
            parentPort!.postMessage({ type: 'progress', event: 'collectProgress', data: progressEvent, taskId: taskId })
        }

        const simplifiedMessages: SimplifiedMessage[] = messages.map(m => ({
            id: m.id,
            text: m.content,
            authorId: m.author.id,
            channelId: m.channel_id,
            timestamp: new Date(m.timestamp).getTime()
        }))

        if (simplifiedMessages.length > 0) {
            await this.addToDbWriteQueue(simplifiedMessages, guildId, channel.name, channel.id, isEntireChannel ? channel.id : undefined, forceRescan)
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
            },
            taskId: taskId
        })

        return messages.length
    }

    public async getMessageStats(options: MessageStatsOptions, taskId: string) {
        const startTime = Date.now()
        parentPort!.postMessage({ type: 'progress', event: 'infoProgress', data: { step: 'querying', progress: 0, total: 1, elapsedTime: 0, estimatedTimeRemaining: null, taskId } })

        const messages = await this.dataSource.getMessages({
            guildId: options.guildId,
            channelId: options.channelId,
            user: options.user,
            userId: options.userId,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        parentPort!.postMessage({ type: 'progress', event: 'infoProgress', data: { step: 'processing', progress: 0, total: messages.length, elapsedTime: Date.now() - startTime, estimatedTimeRemaining: null, taskId } })

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
                    const ts = Number(msg.timestamp)
                    if (isNaN(ts)) continue

                    if (oldestTimestamp === null || ts < oldestTimestamp) {
                        oldestTimestamp = ts
                    }
                    if (newestTimestamp === null || ts > newestTimestamp) {
                        newestTimestamp = ts
                    }
                }
            }
            parentPort!.postMessage({ type: 'progress', event: 'infoProgress', data: { step: 'processing', progress: Math.min(i + CHUNK_SIZE, messages.length), total: messages.length, elapsedTime: Date.now() - startTime, estimatedTimeRemaining: null, taskId } })
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

    public async deleteMessages(options: DeleteOptions) {
        const result = await this.dataSource.deleteMessages({
            guildId: options.guildId,
            channelId: options.channelId,
            user: options.user,
            userId: options.userId,
            global: options.global
        })
        return result.affected ?? 0
    }
}

const engine = new MarkovEngine()

parentPort!.on('message', async (message: { type: string, options: any, taskId: string }) => {
    try {
        if (message.type === 'initialize') {
            const { token } = message.options as { token: string }
            await engine.initialize(token)
            parentPort!.postMessage({ type: 'result', taskId: message.taskId, data: 'initialized' })
            return
        }

        let result
        switch (message.type) {
            case 'collect':
                result = await engine.collectMessages(message.options, message.taskId)
                break
            case 'generate':
                result = await engine.generateMessage(message.options as GenerateOptions, message.taskId)
                break
            case 'info':
                result = await engine.getMessageStats(message.options as MessageStatsOptions, message.taskId)
                break
            case 'delete':
                result = await engine.deleteMessages(message.options as DeleteOptions)
                break
            case 'getMessages':
                result = await engine.getMessages(message.options as MessageStatsOptions)
                break
            case 'create_persistent_chain':
                result = await engine.createPersistentChain(message.options as MessageStatsOptions, message.taskId)
                break
            case 'generate_from_persistent_chain':
                result = engine.generateFromPersistentChain(message.options)
                break
            case 'train_persistent_chain':
                engine.trainPersistentChain(message.options)
                result = 'ok'
                break
            case 'destroy_persistent_chain':
                engine.destroyPersistentChain(message.options.chainId)
                result = 'ok'
                break
            default:
                throw new Error(`Unknown task type: ${message.type}`)
        }
        parentPort!.postMessage({ type: 'result', taskId: message.taskId, data: result })
    } catch (e) {
        const error = e as Error
        log('error', `Error in worker task '${message.type}': ${error.stack ?? error.message}`)
        parentPort!.postMessage({ type: 'error', taskId: message.taskId, error: error.message })
    }
})
