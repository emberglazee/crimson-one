import { singleton, inject } from 'tsyringe'
import { Logger } from './Logger'
import { yellow } from '../util/colors'
const logger = new Logger('GithubWebhook')

import { EventEmitter } from 'tseep'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import { createServer } from 'http'
import crypto from 'crypto'
import { Client, EmbedBuilder, type TextChannel } from 'discord.js'
import type { GithubWebhookEvents } from '../types'

@singleton()
export class GithubWebhookManager extends EventEmitter<GithubWebhookEvents> {
    private server: Server
    private secret: string = ''
    private port: number = 3000
    private channel: TextChannel | null = null

    public constructor(@inject('Client') private client: Client) {
        super()
        this.server = createServer(this.handleRequest.bind(this))
    }

    public setWebhookOptions(options: {
        port: number
        secret: string
    }): GithubWebhookManager {
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
            // Ignore pushes that are part of a pull request
            if (payload.pusher.name === 'web-flow') return

            const branch = payload.ref.split('/').pop()
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: payload.repository.name,
                    iconURL: payload.sender.avatar_url,
                    url: payload.repository.html_url
                })
                .setColor('#7289DA')

            // If head_commit is null, it's a new branch
            if (!payload.head_commit) {
                embed.setTitle(`Branch created: ${branch}`)
                embed.setURL(payload.compare)
                embed.setDescription(`Branch \`${branch}\` was created by ${payload.sender.login}.`)
            } else {
                embed.setTitle(`Push to ${branch}`)
                embed.setURL(payload.compare)
                const description = payload.commits.map(commit =>
                    `[${commit.id.substring(0, 7)}](${commit.url}) ${commit.message}`
                ).join('\\n')
                embed.setDescription(description)
            }

            await this.channel?.send({ embeds: [embed] })
        })

        this.on('pull_request', async payload => {
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: payload.repository.name,
                    iconURL: payload.sender.avatar_url,
                    url: payload.repository.html_url
                })
                .setURL(payload.pull_request.html_url)
                .setTimestamp(new Date(payload.pull_request.created_at))

            switch (payload.action) {
                case 'opened':
                    embed.setTitle(`Pull request opened: #${payload.number} ${payload.pull_request.title}`)
                    embed.setDescription(payload.pull_request.body || 'No description provided.')
                    embed.setColor('#00FF00')
                    break
                case 'closed':
                    if (payload.pull_request.merged) {
                        embed.setTitle(`Pull request merged: #${payload.number} ${payload.pull_request.title}`)
                        embed.setColor('#800080')
                    } else {
                        embed.setTitle(`Pull request closed: #${payload.number} ${payload.pull_request.title}`)
                        embed.setColor('#FF0000')
                    }
                    break
                case 'reopened':
                    embed.setTitle(`Pull request reopened: #${payload.number} ${payload.pull_request.title}`)
                    embed.setColor('#FFA500')
                    break
                default:
                    return // We don't care about other actions
            }

            await this.channel?.send({ embeds: [embed] })
        })

        this.on('issues', async payload => {
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: payload.repository.name,
                    iconURL: payload.sender.avatar_url,
                    url: payload.repository.html_url
                })
                .setURL(payload.issue.html_url)
                .setTimestamp(new Date(payload.issue.created_at))

            switch (payload.action) {
                case 'opened':
                    embed.setTitle(`Issue opened: #${payload.issue.number} ${payload.issue.title}`)
                    embed.setDescription(payload.issue.body || 'No description provided.')
                    embed.setColor('#00FF00')
                    break
                case 'closed':
                    embed.setTitle(`Issue closed: #${payload.issue.number} ${payload.issue.title}`)
                    embed.setColor('#FF0000')
                    break
                case 'reopened':
                    embed.setTitle(`Issue reopened: #${payload.issue.number} ${payload.issue.title}`)
                    embed.setColor('#FFA500')
                    break
                default:
                    return // We don't care about other actions
            }

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
                this.emit(event as keyof GithubWebhookEvents, parsedPayload)

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
