import { singleton, inject } from 'tsyringe'
import { Worker } from 'worker_threads'
import path from 'path'
import { Logger } from '../Logger'
import { red, yellow } from '../../util/colors'
import { type Client, type Guild } from 'discord.js'

import type { SubtitleGradientType } from '../../util/colors'

const logger = new Logger('SubtitleGenerator')

export type SubtitleImageResult = {
    buffer: Buffer
    type: 'image/gif' | 'image/png'
}

export type SubtitleStyle = 'pw' | 'ac7' | 'acz' | 'hd2'

interface GenerateTaskOptions {
    speaker: string
    quote: string
    color: string | null
    gradient: SubtitleGradientType
    stretchGradient: boolean
    style: SubtitleStyle
    interpretNewlines: boolean
    continuousGradient: boolean
    usernames: Record<string, string>
}

@singleton()
export class SubtitleGenerator {
    private worker: Worker | null = null
    private taskIdCounter = 0
    private pendingTasks = new Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }>()

    constructor(@inject('Client') private client: Client) {
        this.initializeWorker()
    }

    private initializeWorker() {
        if (this.worker) return

        this.worker = new Worker(path.join(__dirname, 'worker.js'))

        this.worker.on('message', (message: { type: string, taskId: string, data?: any, error?: string }) => {
            const task = this.pendingTasks.get(message.taskId)
            if (!task) return

            if (message.type === 'result') {
                task.resolve(message.data)
            } else if (message.type === 'error') {
                task.reject(new Error(message.error))
            }
            this.pendingTasks.delete(message.taskId)
        })

        this.worker.on('error', err => {
            logger.error(`SubtitleGenerator worker error: ${red(err.message)}`)
            this.pendingTasks.forEach(task => task.reject(err))
            this.pendingTasks.clear()
            this.worker = null
        })

        this.worker.on('exit', code => {
            if (code !== 0) {
                logger.warn(`SubtitleGenerator worker exited with code ${yellow(code)}`)
            }
            this.worker = null
        })
    }

    private sendTask<T>(type: string, options: any): Promise<T> {
        if (!this.worker) {
            this.initializeWorker()
            if (!this.worker) {
                return Promise.reject(new Error('SubtitleGenerator worker is not running.'))
            }
        }

        const taskId = `subtitle-${this.taskIdCounter++}`
        return new Promise((resolve, reject) => {
            this.pendingTasks.set(taskId, { resolve, reject })
            this.worker!.postMessage({ type, options, taskId })
        })
    }

    private async fetchUsername(id: string, guild: Guild | null): Promise<string> {
        if (!this.client) return id
        try {
            if (guild) {
                const member = await guild.members.fetch(id)
                if (member) return member.displayName
            }
            const user = await this.client.users.fetch(id)
            return user.displayName
        } catch (e) {
            logger.error(`Failed to fetch username for ${yellow(id)}: ${red((e as Error).message)}`)
            return id
        }
    }

    public async createSubtitleImage(
        guild: Guild,
        speaker: string,
        quote: string,
        color: string | null,
        gradient: SubtitleGradientType,
        stretchGradient = false,
        style: SubtitleStyle = 'pw',
        interpretNewlines = false,
        continuousGradient = false
    ): Promise<SubtitleImageResult> {
        // Find all user mentions to resolve display names
        const pingRegex = /<@!?(\d+)>/g
        const allPings = new Set([
            ...(speaker.match(pingRegex) || []),
            ...(quote.match(pingRegex) || [])
        ].map(m => m.replace(/<@!?|>/g, '')))

        const usernames: Record<string, string> = {}
        for (const id of allPings) {
            usernames[id] = await this.fetchUsername(id, guild)
        }

        const options: GenerateTaskOptions = {
            speaker,
            quote,
            color,
            gradient,
            stretchGradient,
            style,
            interpretNewlines,
            continuousGradient,
            usernames
        }

        const result: SubtitleImageResult = await this.sendTask('generate', options)

        // The buffer from the worker can be a plain object or a Uint8Array, so convert it to a proper Buffer
        if (result.buffer) {
            if (result.buffer instanceof Buffer) {
                // It's already a buffer, nothing to do.
            } else if ((result.buffer as any).type === 'Buffer' && Array.isArray((result.buffer as any).data)) {
                // It's a serialized buffer object
                result.buffer = Buffer.from((result.buffer as any).data)
            } else if (result.buffer instanceof Uint8Array) {
                // It's a Uint8Array
                result.buffer = Buffer.from(result.buffer)
            }
        }

        return result
    }
}
