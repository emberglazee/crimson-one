import { singleton, inject } from 'tsyringe'
import { Logger } from '../Logger'
const logger = new Logger('MarkovChain | Chat')

import { Client, Guild, TextChannel, User } from 'discord.js'
import { EventEmitter } from 'tseep'
import { Worker } from 'worker_threads'
import path from 'path'
import type { GenerationResult, SimplifiedMessage } from './RustChain'

interface InitializeTaskOptions {
    token: string
}

export type { GenerationResult, SimplifiedMessage }

export interface MarkovGenerateProgressEvent {
    step: 'querying' | 'training' | 'generating'
    progress: number
    total: number
    elapsedTime: number
    estimatedTimeRemaining: number | null
    taskId: string
}

export interface MarkovCollectProgressEvent {
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

export interface MarkovInfoProgressEvent {
    step: 'querying' | 'processing'
    progress: number
    total: number
    elapsedTime: number
    estimatedTimeRemaining: number | null
    taskId: string
}

interface CollectTaskOptions {
    guildId: string
    channelId: string
    user?: User
    userId?: string
    limit?: number | 'entire'
    delayMs?: number
    forceRescan?: boolean
    platform?: 'discord' | 'stoat'
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
    platform?: 'discord' | 'stoat'
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

    private workerAvailable = false

    public constructor(@inject('Client') private client: Client) {
        super()
        this.initializeWorker().catch(err => {
            logger.warn(
                `MarkovChain initialization failed (PostgreSQL may not be available): ${err.message}`
            )
            logger.info(
                'MarkovChain features will be disabled. The bot will continue running.'
            )
            this.workerAvailable = false
        })
    }

    private async initializeWorker(): Promise<void> {
        if (this.worker) return

        this.worker = new Worker(path.join(__dirname, 'worker.js'), {
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
            this.workerAvailable = false
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
            this.workerAvailable = false
        })

        // Send initialization message to worker with timeout
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new Error('Worker initialization timeout')),
                    10000
                )
            })
            await Promise.race([
                this.sendTask(
                    'initialize',
                    { token: this.client!.token! },
                    true
                ),
                timeoutPromise
            ])
            this.workerAvailable = true
            logger.ok('MarkovChain worker initialized successfully')
        } catch (err) {
            // Worker failed to initialize within timeout or errored
            logger.warn(
                `MarkovChain worker failed to initialize: ${err instanceof Error ? err.message : String(err)}`
            )
            this.workerAvailable = false
            // Terminate the hanging worker
            if (this.worker) {
                try {
                    await this.worker.terminate()
                } catch {
                    // Ignore termination errors
                }
                this.worker = null
            }
            throw err
        }
    }

    private async sendTask<T>(
        type: string,
        options: AllTaskOptions,
        skipAvailabilityCheck = false
    ): Promise<T> {
        // Check if worker is available (skip this check for initialization)
        if (!skipAvailabilityCheck && (!this.workerAvailable || !this.worker)) {
            throw new Error(
                'MarkovChain features are currently unavailable (PostgreSQL not connected)'
            )
        }

        // For initialization, we still need a worker
        if (!this.worker) {
            throw new Error('Markov worker is not available')
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

    public async collectMessages(
        channel: TextChannel,
        options: {
            user?: User
            userId?: string
            limit?: number | 'entire'
            delayMs?: number
            forceRescan?: boolean
            platform?: 'discord' | 'stoat'
        } = {}
    ): Promise<{ taskId: string, completionPromise: Promise<number> }> {
        if (!this.client) throw new Error('Client not set')

        if (!this.workerAvailable || !this.worker) {
            throw new Error(
                'MarkovChain features are currently unavailable (PostgreSQL not connected)'
            )
        }

        const {
            user,
            userId,
            limit,
            delayMs,
            forceRescan,
            platform = 'discord'
        } = options

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
                    forceRescan,
                    platform
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
            batch,
            platform = 'discord'
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
                batch,
                platform
            }
        )
    }

    public async getMessageStats(
        options: MarkovGenerateOptions
    ): Promise<MessageStats> {
        const {
            guild,
            channel,
            user,
            userId,
            global,
            platform = 'discord'
        } = options
        return this.sendTask<MessageStats>('info', {
            guildId: guild?.id,
            channelId: channel?.id,
            user,
            userId,
            global,
            platform
        })
    }

    public async deleteMessages(
        options: MarkovDeleteOptions & { platform?: 'discord' | 'stoat' }
    ): Promise<number> {
        const {
            guild,
            channel,
            user,
            userId,
            global,
            platform = 'discord'
        } = options
        return this.sendTask<number>('delete', {
            guildId: guild?.id,
            channelId: channel?.id,
            user,
            userId,
            global,
            platform
        })
    }

    public async getMessages(options: {
        guild?: Guild
        channel?: TextChannel
        user?: User
        userId?: string
        global?: boolean
    }): Promise<SimplifiedMessage[]> {
        const { guild, channel, user, userId, global } = options
        return this.sendTask<SimplifiedMessage[]>('getMessages', {
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
