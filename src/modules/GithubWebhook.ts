import { EventEmitter } from 'tseep'
import type { IncomingMessage, ServerResponse } from 'http'
import { createServer } from 'http'
import crypto from 'crypto'
import { Client, EmbedBuilder, type TextChannel } from 'discord.js'
import { Logger } from '../util/logger'
import type { GitHubPushEvent } from '../types/types'
import CrimsonChat from './CrimsonChat'

const logger = Logger.new('GithubWebhook')

type WebhookEvents = {
    push: (payload: GitHubPushEvent) => void
    pull_request: (payload: any) => void
    issues: (payload: any) => void
    error: (error: Error) => void
} & {
    [key: string]: (...args: any[]) => void
}

export class GithubWebhook extends EventEmitter<WebhookEvents> {
    private static instance: GithubWebhook
    private server
    private secret: string
    private port: number
    private client: Client | null = null
    private thread: TextChannel | null = null

    private constructor(options: {
        port: number
        secret: string
    }) {
        super()
        this.secret = options.secret
        this.port = options.port
        this.server = createServer(this.handleRequest.bind(this))
    }

    public static getInstance(options?: {
        port: number
        secret: string
    }): GithubWebhook {
        if (!GithubWebhook.instance && options) {
            GithubWebhook.instance = new GithubWebhook(options)
        }
        return GithubWebhook.instance
    }

    public async init(client: Client) {
        this.client = client
        this.thread = await client.channels.fetch('1333319963737325570') as TextChannel
        if (!this.thread) {
            throw new Error('Could not find webhook thread')
        }

        // Set up event handlers for different types of webhook events
        this.on('push', async payload => {
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: payload.repository.name,
                    iconURL: this.client!.user!.displayAvatarURL()
                })
                .setTitle('Push Event')
                .setDescription(`[${payload.head_commit.id.substring(0, 7)}](${payload.head_commit.url}) - ${payload.head_commit.message}`)
                .setTimestamp(new Date(payload.head_commit.timestamp))

            const chatInstance = CrimsonChat.getInstance()
            await this.thread?.send({ embeds: [embed] })
            await this.thread?.sendTyping()
            await chatInstance.sendMessage(`GitHub Webhook Event\n\`\`\`json\n${JSON.stringify({
                type: 'push',
                repo: payload.repository.name,
                commit: {
                    id: payload.head_commit.id.substring(0, 7),
                    url: payload.head_commit.url,
                    message: payload.head_commit.message,
                    timestamp: payload.head_commit.timestamp
                }
            }, null, 2)}\n\`\`\``, {
                username: 'GitHub',
                displayName: 'GitHub Webhook',
                serverDisplayName: 'GitHub Webhook'
            })
        })

        await this.start()
        logger.ok('Github webhook initialized and listening on port ' + this.port)
    }

    private verifySignature(payload: string, signature: string): boolean {
        const hmac = crypto.createHmac('sha256', this.secret)
        const digest = 'sha256=' + hmac.update(payload).digest('hex')
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse) {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'text/plain' })
            res.end('Method not allowed')
            return
        }

        const signature = req.headers['x-hub-signature-256']
        const event = req.headers['x-github-event']

        if (!signature || !event || Array.isArray(signature) || Array.isArray(event)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('Missing required headers')
            return
        }

        let payload = ''
        req.on('data', chunk => {
            payload += chunk.toString()
        })

        req.on('end', () => {
            try {
                if (!this.verifySignature(payload, signature)) {
                    res.writeHead(401, { 'Content-Type': 'text/plain' })
                    res.end('Invalid signature')
                    return
                }

                const parsedPayload = JSON.parse(payload)
                this.emit(event as keyof WebhookEvents, parsedPayload)

                res.writeHead(200, { 'Content-Type': 'text/plain' })
                res.end('OK')
            } catch (error) {
                this.emit('error', error as Error)
                res.writeHead(500, { 'Content-Type': 'text/plain' })
                res.end('Internal server error')
            }
        })
    }

    public start(): Promise<void> {
        return new Promise(resolve => {
            this.server.listen(this.port, () => {
                resolve()
            })
        })
    }

    public stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }
}