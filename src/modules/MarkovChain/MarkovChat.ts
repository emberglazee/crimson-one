import { Logger } from '../../util/logger'
const logger = new Logger('MarkovChain | Chat')

import { Client, Guild, TextChannel, User } from 'discord.js'
import { EventEmitter } from 'tseep'
import { Worker } from 'worker_threads'
import path from 'path'

interface InitializeTaskOptions {
    token: string
    userToken?: string
}

interface CollectTaskOptions {
    guildId: string
    channelId: string
    user?: User
    userId?: string
    limit?: number | 'entire'
    delayMs?: number
    disableUserApiLookup?: boolean
    forceRescan?: boolean
}

type AllTaskOptions = InitializeTaskOptions | CollectTaskOptions | MarkovGenerateOptions

interface MarkovGenerateOptions {
    guild?: Guild
    channel?: TextChannel
    user?: User
    userId?: string
    words?: number
    seed?: string
    global?: boolean
    mode?: 'trigram' | 'bigram'
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
    private worker: Worker | null = null
    private taskIdCounter = 0
    private pendingTasks = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

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
        this.initializeWorker()
    }

    private initializeWorker() {
        if (this.worker) return

        this.worker = new Worker(path.join(__dirname, 'worker.js'), { /* workerData: { token: this.client!.token } */ })

        this.worker.on('message', (message: { type: string, event: string, data: unknown, taskId: string, error: string }) => {
            if (message.type === 'progress') {
                const eventName = message.event as keyof MarkovChat['events']
                switch (eventName) {
                    case 'collectProgress':
                        this.emit(eventName, message.data as MarkovCollectProgressEvent)
                        break
                    case 'collectComplete':
                        this.emit(eventName, message.data as { totalCollected: number; channelName: string; userFiltered: boolean; entireChannel: boolean; newMessagesOnly: boolean; totalMessageCount?: number })
                        break
                    case 'generateProgress':
                        this.emit(eventName, message.data as MarkovGenerateProgressEvent)
                        break
                    case 'infoProgress':
                        this.emit(eventName, message.data as MarkovInfoProgressEvent)
                        break
                }
            } else if (message.type === 'result') {
                const task = this.pendingTasks.get(message.taskId)
                if (task) {
                    task.resolve(message.data)
                    this.pendingTasks.delete(message.taskId)
                }
            } else if (message.type === 'error') {
                const task = this.pendingTasks.get(message.taskId)
                if (task) {
                    task.reject(new Error(message.error))
                    this.pendingTasks.delete(message.taskId)
                }
            }
        })

        this.worker.on('error', err => {
            logger.error(`Markov worker error: ${err.message}`)
            // Reject all pending tasks if worker crashes
            this.pendingTasks.forEach(task => task.reject(err))
            this.pendingTasks.clear()
            this.worker = null // Mark worker as crashed
        })

        this.worker.on('exit', code => {
            if (code !== 0) {
                logger.error(`Markov worker exited with code ${code}`)
                // Reject all pending tasks if worker exits unexpectedly
                this.pendingTasks.forEach(task => task.reject(new Error(`Worker exited with code ${code}`)))
                this.pendingTasks.clear()
            }
            this.worker = null // Mark worker as exited
        })

        // Send initialization message to worker
        this.sendTask('initialize', { token: this.client!.token!, userToken: process.env.DISCORD_USER_TOKEN })
    }

    private sendTask<T>(type: string, options: AllTaskOptions): Promise<T> {
        if (!this.worker) {
            // Attempt to re-initialize worker if it's null (e.g., crashed or not yet started)
            this.initializeWorker()
            if (!this.worker) {
                return Promise.reject(new Error('Markov worker is not available.'))
            }
        }

        const taskId = `task-${this.taskIdCounter++}`
        return new Promise<T>((resolve, reject) => {
            this.pendingTasks.set(taskId, { resolve: resolve as (value: unknown) => void, reject })
            this.worker!.postMessage({ type, options, taskId })
        })
    }

    public async collectMessages(channel: TextChannel, options: {
        user?: User
        userId?: string
        limit?: number | 'entire'
        delayMs?: number
        disableUserApiLookup?: boolean
        forceRescan?: boolean
    } = {}): Promise<number> {
        if (!this.client) throw new Error('Client not set')

        const { user, userId, limit, delayMs, disableUserApiLookup, forceRescan } = options

        return this.sendTask<number>('collect', {
            guildId: channel.guild.id,
            channelId: channel.id,
            user,
            userId,
            limit,
            delayMs,
            disableUserApiLookup,
            forceRescan
        })
    }

    public async generateMessage(options: MarkovGenerateOptions): Promise<string> {
        const { guild, channel, user, userId, words, seed, global, mode } = options
        return this.sendTask<string>('generate', {
            guildId: guild?.id,
            channelId: channel?.id,
            user,
            userId,
            words,
            seed,
            global,
            mode
        })
    }

    public async getMessageStats(options: MarkovGenerateOptions): Promise<MessageStats> {
        return this.sendTask<MessageStats>('info', options)
    }
}
