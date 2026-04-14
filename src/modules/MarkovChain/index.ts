import { singleton, inject } from 'tsyringe'
import { Logger } from '../Logger'
const logger = new Logger('MarkovChain | Chat')

import { Client, Guild, TextChannel, User } from 'discord.js'
import { EventEmitter } from 'tseep'
import { Worker } from 'worker_threads'
import path from 'path'
import type { GenerationResult, SimplifiedMessage } from './RustChain'
import type { Message } from './entities/Message'

interface InitializeTaskOptions {
    token: string
}

export type { GenerationResult, SimplifiedMessage }

interface CollectTaskOptions {
    guildId: string
    channelId: string
    user?: User
    userId?: string
    limit?: number | 'entire'
    delayMs?: number
    forceRescan?: boolean
}

interface MarkovGenerateOptions {
    guild?: Guild
    channel?: TextChannel
    user?: User
    userId?: string
    words?: number
    seed?: string
    global?: boolean
    mode?: 'trigram' | 'bigram' | 'hybrid'
    batch?: number
}

interface MarkovDeleteOptions {
    guild?: Guild
    channel?: TextChannel
    user?: User
    userId?: string
    global?: boolean
}

interface PersistentChainGenerateOptions {
    chainId: string
    seed?: string
    words?: number
}

interface PersistentChainTrainOptions {
    chainId: string
    messages: SimplifiedMessage[]
}

interface PersistentChainDestroyOptions {
    chainId: string
}

type AllTaskOptions =
    | InitializeTaskOptions
    | CollectTaskOptions
    | MarkovGenerateOptions
    | MarkovDeleteOptions
    | PersistentChainGenerateOptions
    | PersistentChainTrainOptions
    | PersistentChainDestroyOptions

interface MarkovCollectProgressEvent {
    batchNumber: number
    messagesCollected: number
    totalCollected: number
    totalFetched: number
    totalIgnored: number
    limit: number | 'entire'
    percentComplete: number
    channelName: string
    startTime: number
    elapsedTime: number
    messagesPerSecond: number
    estimatedTimeRemaining: number | null
    taskId: string
}

export interface MarkovGenerateProgressEvent {
    step: 'querying' | 'training' | 'generating'
    progress: number
    total: number
    elapsedTime: number
    estimatedTimeRemaining: number | null
    taskId: string
}

export interface MarkovInfoProgressEvent {
    step: 'querying' | 'processing'
    progress: number
    total: number
    elapsedTime: number
    estimatedTimeRemaining: number | null
    taskId: string
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

interface MarkovCollectCompleteEvent {
    totalCollected: number
    channelName: string
    userFiltered: boolean
    entireChannel: boolean
    newMessagesOnly: boolean
    totalMessageCount?: number
    taskId: string
}

@singleton()
export class MarkovChat extends EventEmitter<{
    collectProgress: (event: MarkovCollectProgressEvent) => void
    collectComplete: (event: MarkovCollectCompleteEvent) => void
    generateProgress: (event: MarkovGenerateProgressEvent) => void
    infoProgress: (event: MarkovInfoProgressEvent) => void
}> {
    private worker: Worker | null = null
    private taskIdCounter = 0
    private pendingTasks = new Map<
        string,
        {
            resolve: (value: unknown) => void
            reject: (reason?: unknown) => void
        }
    >()

    public constructor(@inject('Client') private client: Client) {
        super()
        this.initializeWorker()
    }

    private initializeWorker() {
        if (this.worker) return

        this.worker = new Worker(path.join(__dirname, 'worker.ts'), {
            /* workerData: { token: this.client!.token } */
        })

        this.worker.on(
            'message',
            (message: {
                type: string
                event: string
                data: unknown
                taskId: string
                error: string
                level: 'debug' | 'info' | 'warn' | 'error'
            }) => {
                if (message.type === 'log') {
                    logger[message.level](message.data as string)
                } else if (message.type === 'progress') {
                    const eventName =
                        message.event as keyof MarkovChat['events']
                    if (
                        typeof message.data === 'object' &&
                        message.data !== null
                    ) {
                        const eventDataWithId = {
                            ...message.data,
                            taskId: message.taskId
                        }
                        switch (eventName) {
                            case 'collectProgress':
                                this.emit(
                                    eventName,
                                    eventDataWithId as MarkovCollectProgressEvent
                                )
                                break
                            case 'collectComplete':
                                this.emit(
                                    eventName,
                                    eventDataWithId as MarkovCollectCompleteEvent
                                )
                                break
                            case 'generateProgress':
                                this.emit(
                                    eventName,
                                    eventDataWithId as MarkovGenerateProgressEvent
                                )
                                break
                            case 'infoProgress':
                                this.emit(
                                    eventName,
                                    eventDataWithId as MarkovInfoProgressEvent
                                )
                                break
                        }
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
            }
        )

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
                this.pendingTasks.forEach(task =>
                    task.reject(new Error(`Worker exited with code ${code}`))
                )
                this.pendingTasks.clear()
            }
            this.worker = null // Mark worker as exited
        })

        // Send initialization message to worker
        this.sendTask('initialize', { token: this.client!.token! })
    }

    private sendTask<T>(type: string, options: AllTaskOptions): Promise<T> {
        if (!this.worker) {
            // Attempt to re-initialize worker if it's null (e.g., crashed or not yet started)
            this.initializeWorker()
            if (!this.worker) {
                return Promise.reject(
                    new Error('Markov worker is not available.')
                )
            }
        }

        const taskId = `task-${this.taskIdCounter++}`
        return new Promise<T>((resolve, reject) => {
            this.pendingTasks.set(taskId, {
                resolve: resolve as (value: unknown) => void,
                reject
            })
            this.worker!.postMessage({ type, options, taskId })
        })
    }

    public collectMessages(
        channel: TextChannel,
        options: {
            user?: User
            userId?: string
            limit?: number | 'entire'
            delayMs?: number
            forceRescan?: boolean
        } = {}
    ): { taskId: string, completionPromise: Promise<number> } {
        if (!this.client) throw new Error('Client not set')

        if (!this.worker) {
            this.initializeWorker()
            if (!this.worker) {
                throw new Error('Markov worker is not available.')
            }
        }

        const { user, userId, limit, delayMs, forceRescan } = options

        const taskId = `task-${this.taskIdCounter++}`
        const completionPromise = new Promise<number>((resolve, reject) => {
            this.pendingTasks.set(taskId, {
                resolve: resolve as (value: unknown) => void,
                reject
            })
            this.worker!.postMessage({
                type: 'collect',
                options: {
                    guildId: channel.guild.id,
                    channelId: channel.id,
                    user,
                    userId,
                    limit,
                    delayMs,
                    forceRescan
                },
                taskId
            })
        })

        return { taskId, completionPromise }
    }

    public async generateMessage(
        options: MarkovGenerateOptions
    ): Promise<GenerationResult | GenerationResult[] | null> {
        const {
            guild,
            channel,
            user,
            userId,
            words,
            seed,
            global,
            mode,
            batch
        } = options
        return this.sendTask<GenerationResult | GenerationResult[] | null>(
            'generate',
            {
                guildId: guild?.id,
                channelId: channel?.id,
                user,
                userId,
                words,
                seed,
                global,
                mode,
                batch
            }
        )
    }

    public async getMessageStats(
        options: MarkovGenerateOptions
    ): Promise<MessageStats> {
        const { guild, channel, user, userId, global } = options
        return this.sendTask<MessageStats>('info', {
            guildId: guild?.id,
            channelId: channel?.id,
            user,
            userId,
            global
        })
    }

    public async deleteMessages(options: MarkovDeleteOptions): Promise<number> {
        const { guild, channel, user, userId, global } = options
        return this.sendTask<number>('delete', {
            guildId: guild?.id,
            channelId: channel?.id,
            user,
            userId,
            global
        })
    }

    public async getMessages(options: {
        guild?: Guild
        channel?: TextChannel
        user?: User
        userId?: string
        global?: boolean
    }): Promise<Message[]> {
        const { guild, channel, user, userId, global } = options
        return this.sendTask<Message[]>('getMessages', {
            guildId: guild?.id,
            channelId: channel?.id,
            user,
            userId,
            global
        })
    }

    public createPersistentChain(options: {
        guild?: Guild
        user?: User
        userId?: string
        global?: boolean
    }): Promise<string> {
        const { guild, user, userId, global } = options
        return this.sendTask<string>('create_persistent_chain', {
            guildId: guild?.id,
            user,
            userId,
            global
        })
    }

    public generateFromPersistentChain(options: {
        chainId: string
        seed?: string
        words?: number
    }): Promise<GenerationResult | null> {
        return this.sendTask<GenerationResult | null>(
            'generate_from_persistent_chain',
            options
        )
    }

    public trainPersistentChain(options: {
        chainId: string
        messages: SimplifiedMessage[]
    }): Promise<void> {
        return this.sendTask<void>('train_persistent_chain', options)
    }

    public destroyPersistentChain(chainId: string): Promise<void> {
        return this.sendTask<void>('destroy_persistent_chain', { chainId })
    }
}
