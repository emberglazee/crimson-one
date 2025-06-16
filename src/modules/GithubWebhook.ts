import { Logger, yellow } from '../util/logger'
const logger = new Logger('GithubWebhook')

import { EventEmitter } from 'tseep'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import { createServer } from 'http'
import crypto from 'crypto'
import { Client, EmbedBuilder, type TextChannel } from 'discord.js'
import type { WebhookEvents } from '../types'

export class GithubWebhook extends EventEmitter<WebhookEvents> {
    private static instance: GithubWebhook
    private server: Server
    private secret: string = ''
    private port: number = 3000
    private client: Client | null = null
    private channel: TextChannel | null = null

    private constructor() {
        super()
        this.server = createServer(this.handleRequest.bind(this))
    }

    public static getInstance(): GithubWebhook {
        if (!GithubWebhook.instance) {
            GithubWebhook.instance = new GithubWebhook()
        }
        return GithubWebhook.instance
    }

    public setClient(client: Client): GithubWebhook {
        this.client = client
        return this
    }

    public setWebhookOptions(options: {
        port: number
        secret: string
    }): GithubWebhook {
        this.port = options.port
        this.secret = options.secret
        return this
    }

    public async init() {
        if (!this.client) {
            throw new Error('Client not set. Call setClient() first.')
        }
        this.channel = await this.client.channels.fetch('1331556083776487444') as TextChannel
        if (!this.channel) {
            throw new Error('Could not find webhook channel')
        }

        // Set up event handlers for different types of webhook events
        this.on('push', async payload => {
            let description = ''
            if (payload.commits && payload.commits.length > 0) {
                description = payload.commits.map(commit =>
                    `[${commit.id.substring(0, 7)}](${commit.url}) - ${commit.message}`
                ).join('\n')
            } else if (payload.head_commit) {
                description = `[${payload.head_commit.id.substring(0, 7)}](${payload.head_commit.url}) - ${payload.head_commit.message}`
            } else {
                description = 'No commit information.'
            }

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: payload.repository.name,
                    iconURL: this.client!.user!.displayAvatarURL()
                })
                .setTitle('Push Event')
                .setDescription(description)
                .setTimestamp(new Date(payload.head_commit?.timestamp || Date.now()))

            await this.channel?.send({ embeds: [embed] })
        })

        await this.start()
        logger.ok(`Github webhook initialized and listening on port ${yellow(this.port)}`)
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
            this.server.close(err => {
                if (err) reject(err)
                else resolve()
            })
        })
    }
}
