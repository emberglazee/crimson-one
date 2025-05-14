// connect the web interface of shapes.inc (fancier version of character.ai) with the discord bot
import { Logger } from '../util/logger'
const logger = new Logger('ShapesInc')

import { inspect } from 'util'

import type { ShapesIncGetChatHistoryResponse, ShapesIncSendMessageResponse, ShapesIncClearChatResponse, ShapesIncShape } from '../types/types'
import fs from 'fs/promises'
import path from 'path'
import { parseNetscapeCookieFile } from '../util/functions'
import OpenAI from 'openai'
import { ChannelType, Client, Message, TextChannel, Webhook } from 'discord.js'

export default class ShapesInc {
    private static instance: ShapesInc
    private webhook?: Webhook
    private channelId: string
    private constructor(public client: Client, channelId: string) {
        this.channelId = channelId
    }
    private cookies!: string
    public userId = 'ab8f795b-cc33-4189-9430-a6917bb85398'
    public shapeId = 'c4fa29df-aa29-40f7-baaa-21f2e3aab46b'
    public shapeUsername = 'crimson-1' // also its vanity link (https://shapes.inc/crimson-1)
    public shapeDisplayName = 'Crimson 1'

    // --- New API fields ---
    private openaiClient?: OpenAI
    private apiKey?: string

    private avatarCache?: { id: string, avatar: string }

    static getInstance(client?: Client, channelId?: string): ShapesInc {
        if (!ShapesInc.instance) {
            if (!client || !channelId) throw new Error('Client and channelId must be provided for first ShapesInc instantiation')
            ShapesInc.instance = new ShapesInc(client, channelId)
        }
        return ShapesInc.instance
    }

    /**
     * Initialize both legacy (cookie) and new (API key) credentials
     */
    async init() {
        // Legacy cookie init
        const cookiesPath = path.join(__dirname, '../../data/shapesinc-cookies.txt')
        try {
            const cookiesTxt = await fs.readFile(cookiesPath, 'utf-8')
            const cookiesArr = parseNetscapeCookieFile(cookiesTxt)
            this.cookies = cookiesArr.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
            logger.ok('{init} Loaded cookies from file (Netscape format)')
        } catch (err) {
            logger.error(`{init} Failed to load cookies from file: ${err}`)
            // Not throwing here, as new API may still work
        }
        // New API key init
        this.apiKey = process.env.SHAPES_INC_API_KEY
        if (this.apiKey) {
            this.openaiClient = new OpenAI({
                apiKey: this.apiKey,
                baseURL: 'https://api.shapes.inc/v1',
            })
            logger.ok('{init} Initialized OpenAI client for Shapes API')
        } else {
            logger.error('{init} SHAPES_INC_API_KEY missing in environment')
        }
    }

    // --- New API: OpenAI-compatible Shapes API ---
    /**
     * Send a message using the new OpenAI-compatible Shapes API
     * @param message The message to send
     * @param imageUrl Optional image URL to send as multimodal input
     */
    async sendMessageAPI(message: string, imageUrl?: string): Promise<string> {
        if (!this.openaiClient || !this.shapeUsername) {
            throw new Error('OpenAI client not initialized or shape username missing')
        }
        const model = `shapesinc/${this.shapeUsername}`
        let messages: OpenAI.Chat.ChatCompletionMessageParam[]
        if (imageUrl) {
            messages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: message },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ]
        } else {
            messages = [
                { role: 'user', content: message }
            ]
        }
        try {
            const resp = await this.openaiClient.chat.completions.create({
                model,
                messages
            })
            if (resp.choices && resp.choices.length > 0) {
                return resp.choices[0].message.content || ''
            } else {
                logger.error('{sendMessageAPI} No choices in response')
                return ''
            }
        } catch (err) {
            logger.error(`{sendMessageAPI} Error: ${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
            throw err
        }
    }

    // --- Legacy API: Cookie-based methods (unchanged) ---
    async sendMessage(message: string, attachment_url: string | null = null): Promise<ShapesIncSendMessageResponse> {
        logger.info('{sendMessage} Sending message...')
        const url = `https://shapes.inc/api/shapes/${this.shapeId}/chat`
        const body = JSON.stringify({
            message,
            shapeId: this.shapeId,
            attachment_url
        })
        const cookies = this.cookies
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'cookie': cookies
            },
            body
        }).catch(err => {
            logger.error(`{sendMessage} Error sending message:\n${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
            throw err
        })
        logger.ok('{sendMessage} Done')
        const json = await res.json()
        if (json.error) {
            logger.error(`{sendMessage} Error sending message:\n${json.error}`)
            throw new Error(json.error)
        }
        return json as Promise<ShapesIncSendMessageResponse>
    }
    async clearChat(): Promise<ShapesIncClearChatResponse> {
        const ts = Math.floor(Date.now() / 1000)
        logger.info('{clearChat} Clearing chat...')
        const url = `https://shapes.inc/api/shapes/${this.shapeId}/wack`
        const body = JSON.stringify({
            shapeId: this.shapeId,
            ts,
            user_id: this.userId
        })
        const cookies = this.cookies
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'cookie': cookies
            },
            body
        })
        logger.ok('{clearChat} Done')
        return res.json() as Promise<ShapesIncClearChatResponse>
    }
    async getChatHistory(): Promise<ShapesIncGetChatHistoryResponse<20>> {
        logger.info('{getChatHistory} Getting chat history...')
        const url = `https://shapes.inc/api/shapes/${this.shapeId}/chat/history?limit=20&shape_id=${this.shapeId}`
        const cookies = this.cookies
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'cookie': cookies
            }
        })
        logger.ok('{getChatHistory} Done')
        return res.json() as Promise<ShapesIncGetChatHistoryResponse<20>>
    }

    async fetchShapeByUsername(shapeUsername: string) {
        const url = `https://shapes.inc/api/shapes/username/${shapeUsername}`
        const cookies = this.cookies
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'cookie': cookies
            }
        })
        return res.json() as Promise<ShapesIncShape>
    }
    async fetchShapeByUUID(uuid: string) {
        const url = `https://shapes.inc/api/shapes/${uuid}`
        const cookies = this.cookies
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'cookie': cookies
            }
        })
        return res.json() as Promise<ShapesIncShape>
    }

    public async changeShapeByUUID(uuid: string) {
        const data = await this.fetchShapeByUUID(uuid)
        this.shapeId = data.id
        this.shapeUsername = data.username
        this.shapeDisplayName = data.name
        // Update avatar cache
        this.avatarCache = undefined
        await this.fetchShapeAvatarBase64(this.shapeId)
    }
    public async changeShapeByUsername(shapeUsername: string) {
        const data = await this.fetchShapeByUsername(shapeUsername)
        this.shapeId = data.id
        this.shapeUsername = data.username
        this.shapeDisplayName = data.name
        // Update avatar cache
        this.avatarCache = undefined
        await this.fetchShapeAvatarBase64(this.shapeId)
    }

    public async fetchShapeAvatarBase64(uuid: string): Promise<string> {
        if (this.avatarCache && this.avatarCache.id === uuid) {
            return this.avatarCache.avatar
        }
        const url = `https://files.shapes.inc/api/files/avatar_${uuid}.png`
        try {
            const res = await fetch(url)
            if (!res.ok) {
                throw new Error(`Failed to fetch avatar: ${res.status} ${res.statusText}`)
            }
            const buffer = await res.arrayBuffer()
            const base64 = Buffer.from(buffer).toString('base64')
            const avatar = `data:image/png;base64,${base64}`
            this.avatarCache = { id: uuid, avatar }
            return avatar
        } catch (err) {
            logger.error(`{fetchShapeAvatarBase64} Error: ${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
            throw err
        }
    }

    /**
     * Get the direct CDN URL for a shape's avatar image
     */
    public getShapeAvatarUrl(uuid: string): string {
        return `https://files.shapes.inc/api/files/avatar_${uuid}.png`
    }

    /**
     * Process a Discord message: format, extract image, and send to Shapes API
     * @param message Discord.js Message object
     */
    async processDiscordMessage(message: Message): Promise<string> {
        let msg = ''
        if (message.reference) {
            try {
                const ref = await message.fetchReference()
                msg += `> <u>${ref.author.username}</u>: ${ref.content}\n\n`
            } catch {
                // ignore if reference can't be fetched
            }
        }
        msg += `<u>${message.author.username}</u>: ${message.content}`

        // Check for image attachments or image URLs in content
        let imageUrl: string | null = null
        if (message.attachments && message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                    imageUrl = attachment.url
                    break
                }
            }
        }
        // If no image attachment, check for image URLs in message.content
        if (!imageUrl && message.content) {
            const imageUrlMatch = message.content.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/i)
            if (imageUrlMatch) {
                imageUrl = imageUrlMatch[0]
            }
        }

        return this.sendMessageAPI(msg, imageUrl ?? undefined)
    }

    /**
     * Get or create a webhook for the configured channel
     */
    public async getOrCreateWebhook(): Promise<Webhook> {
        if (this.webhook) return this.webhook
        const channel = await this.client.channels.fetch(this.channelId)
        if (!channel || !(channel instanceof TextChannel)) {
            throw new Error('ShapesInc channel not found or not a text channel')
        }
        // Try to find an existing webhook with a known name
        const webhooks = await channel.fetchWebhooks()
        let webhook = webhooks.find(wh => wh.name === 'ShapesInc')
        if (!webhook) {
            // Use the shape's avatar as the webhook avatar
            let avatar: string | undefined
            try {
                avatar = this.getShapeAvatarUrl(this.shapeId)
            } catch {
                avatar = undefined // fallback to default
            }
            webhook = await channel.createWebhook({
                name: this.shapeDisplayName || 'ShapesInc',
                avatar
            })
        }
        this.webhook = webhook
        return webhook
    }
    /**
     * Handle a Discord message: only respond if in the configured channel, and use webhook if possible
     */
    public async handleMessage(message: Message): Promise<void> {
        // Ignore messages sent by webhooks or by the bot itself
        if (message.webhookId) return
        if (message.author.id === this.client.user?.id) return
        if (message.channel.id !== this.channelId) return
        if (message.channel.type !== ChannelType.GuildText) return
        await message.channel.sendTyping()
        const res = await this.processDiscordMessage(message)
        // Try to use webhook for immersive reply
        try {
            const webhook = await this.getOrCreateWebhook()
            const avatar = this.getShapeAvatarUrl(this.shapeId)
            await webhook.send({
                content: res || 'I HATE YOU MONARCH!',
                username: this.shapeDisplayName || this.shapeUsername,
                avatarURL: avatar,
                allowedMentions: { repliedUser: true, parse: ['users'] }
            })
        } catch (err) {
            const error = err instanceof Error ? err.message : inspect(err)
            logger.warn(`{handleMessage} Webhook failed: ${error}`)
            await message.reply(res + '\n\n-# epic webhook fail' || 'I HATE YOU MONARCH!') // prevent empty string
        }
    }

}
