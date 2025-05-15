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
import { TYPING_EMOJI } from '../util/constants'

export default class ShapesInc {
    private static instance: ShapesInc
    private webhook?: Webhook
    private channelId: string
    private constructor(public client: Client, channelId: string) {
        this.channelId = channelId
    }
    private cookies!: string
    public userId = 'ab8f795b-cc33-4189-9430-a6917bb85398'

    // --- Multi-shape support ---
    private shapes: Map<string, { id: string, username: string, displayName: string }> = new Map()
    private currentShapeUsername: string = 'crimson-1'

    // --- New API fields ---
    private openaiClient?: OpenAI
    private apiKey?: string
    private avatarCache?: { id: string, avatar: string }

    // --- Legacy single-shape fields for backward compatibility ---
    public get shapeId() { return this.shapes.get(this.currentShapeUsername)?.id ?? '' }
    public get shapeUsername() { return this.currentShapeUsername }
    public get shapeDisplayName() { return this.shapes.get(this.currentShapeUsername)?.displayName ?? '' }
    public set shapeUsername(username: string) { this.currentShapeUsername = username }

    // --- Duel mode (one-on-one conversation) ---
    private duelMode: boolean = false
    private duelChannelId: string | null = null
    private duelShapes: [string, string] | null = null // [shapeA, shapeB]
    private duelLastSpeaker: string | null = null
    private duelConversation: { author: string, content: string, isShape: boolean, timestamp: number }[] = []
    private duelLastSent: number = 0
    private readonly DUEL_MIN_INTERVAL_MS = 12_000

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

    // --- Multi-shape management ---
    public async addShapeByUsername(shapeUsername: string) {
        const data = await this.fetchShapeByUsername(shapeUsername)
        this.shapes.set(data.username, { id: data.id, username: data.username, displayName: data.name })
        if (!this.currentShapeUsername) this.currentShapeUsername = data.username
    }
    public async addShapeByUUID(uuid: string) {
        const data = await this.fetchShapeByUUID(uuid)
        this.shapes.set(data.username, { id: data.id, username: data.username, displayName: data.name })
        if (!this.currentShapeUsername) this.currentShapeUsername = data.username
    }
    public setCurrentShape(username: string) {
        if (!this.shapes.has(username)) throw new Error(`Shape ${username} not found`)
        this.currentShapeUsername = username
    }
    public getCurrentShape() {
        return this.shapes.get(this.currentShapeUsername)
    }
    public getShapeUsernames() {
        return Array.from(this.shapes.keys())
    }

    // --- New API: OpenAI-compatible Shapes API ---
    /**
     * Send a message using the new OpenAI-compatible Shapes API
     * @param message The message to send
     * @param imageUrl Optional image URL to send as multimodal input
     */
    async sendMessageAPI(message: string, imageUrl?: string, shapeUsername?: string): Promise<string> {
        if (!this.openaiClient) {
            throw new Error('OpenAI client not initialized')
        }
        const username = shapeUsername || this.currentShapeUsername
        if (!this.shapes.has(username)) throw new Error(`Shape ${username} not loaded`)
        const model = `shapesinc/${username}`
        let messages: OpenAI.Chat.ChatCompletionMessageParam[]
        if (imageUrl) {
            // only one message supported per request; conversation memory is handled in the Shape itself (legacy cookie-based)
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
    async sendMessage(message: string, attachment_url: string | null = null, shapeUsername?: string): Promise<ShapesIncSendMessageResponse> {
        logger.info('{sendMessage} Sending message...')
        const username = shapeUsername || this.currentShapeUsername
        const shape = this.shapes.get(username)
        if (!shape) throw new Error(`Shape ${username} not loaded`)
        const url = `https://shapes.inc/api/shapes/${shape.id}/chat`
        const body = JSON.stringify({
            message,
            shapeId: shape.id,
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
    async clearChat(shapeUsername?: string): Promise<ShapesIncClearChatResponse> {
        const ts = Math.floor(Date.now() / 1000)
        logger.info('{clearChat} Clearing chat...')
        const username = shapeUsername || this.currentShapeUsername
        const shape = this.shapes.get(username)
        if (!shape) throw new Error(`Shape ${username} not loaded`)
        const url = `https://shapes.inc/api/shapes/${shape.id}/wack`
        const body = JSON.stringify({
            shapeId: shape.id,
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
    async getChatHistory(shapeUsername?: string): Promise<ShapesIncGetChatHistoryResponse<20>> {
        logger.info('{getChatHistory} Getting chat history...')
        const username = shapeUsername || this.currentShapeUsername
        const shape = this.shapes.get(username)
        if (!shape) throw new Error(`Shape ${username} not loaded`)
        const url = `https://shapes.inc/api/shapes/${shape.id}/chat/history?limit=20&shape_id=${shape.id}`
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
        this.shapes.set(data.username, { id: data.id, username: data.username, displayName: data.name })
        this.currentShapeUsername = data.username
        this.avatarCache = undefined
        await this.fetchShapeAvatarBase64(data.id)
    }
    public async changeShapeByUsername(shapeUsername: string) {
        const data = await this.fetchShapeByUsername(shapeUsername)
        this.shapes.set(data.username, { id: data.id, username: data.username, displayName: data.name })
        this.currentShapeUsername = data.username
        this.avatarCache = undefined
        await this.fetchShapeAvatarBase64(data.id)
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
    async processDiscordMessage(message: Message, shapeUsername?: string): Promise<string> {
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

        return this.sendMessageAPI(msg, imageUrl ?? undefined, shapeUsername)
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
    public async handleMessage(message: Message, shapeUsername?: string): Promise<void> {
        // --- Duel mode logic ---
        if (this.duelMode && this.duelChannelId && this.duelShapes && message.channel.id === this.duelChannelId) {
            if (message.webhookId) return
            // Only allow duel participants
            const duelParticipants = this.duelShapes
            if (!duelParticipants.includes(message.author.username)) return
            // Add user message to duelConversation
            this._addToDuelConversation({
                author: message.author.username,
                content: message.content,
                isShape: false,
                timestamp: Date.now()
            })
            // Send user message to Discord (as themselves, not webhook)
            // (Optional: could skip this if you want only shape replies visible)
            // Now, process the duel turn
            await this._processDuelTurn()
            return
        }
        // --- Normal mode logic ---
        if (message.webhookId) return
        if (message.author.id === this.client.user?.id) return
        if (message.channel.id !== this.channelId) return
        if (message.channel.type !== ChannelType.GuildText) return
        const typingMsg = await message.channel.send(`${TYPING_EMOJI} Shape is typing...`)
        let res = ''
        try {
            res = await this.processDiscordMessage(message, shapeUsername)
            const webhook = await this.getOrCreateWebhook()
            const avatar = this.getShapeAvatarUrl(this.shapeId)
            await typingMsg.delete().catch(() => {})
            await webhook.send({
                content: res || 'I HATE YOU MONARCH!',
                username: this.shapeDisplayName || this.shapeUsername,
                avatarURL: avatar,
                allowedMentions: { repliedUser: true, parse: ['users'] }
            })
        } catch (err) {
            const error = err instanceof Error ? err.message : inspect(err)
            logger.warn(`{handleMessage} Webhook failed: ${error}`)
            await typingMsg.delete().catch(() => {})
            await message.reply(res + '\n\n-# epic webhook fail' || 'I HATE YOU MONARCH!')
        }
    }

    /**
     * Get or create a webhook for a specific shape in a specific channel
     */
    private async getOrCreateWebhookForShape(shapeUsername: string, channelId: string): Promise<Webhook> {
        const shape = this.shapes.get(shapeUsername)
        if (!shape) throw new Error(`Shape ${shapeUsername} not loaded`)
        const channel = await this.client.channels.fetch(channelId)
        if (!channel || !(channel instanceof TextChannel)) {
            throw new Error('ShapesInc duel channel not found or not a text channel')
        }
        // Try to find an existing webhook for this shape
        const webhooks = await channel.fetchWebhooks()
        let webhook = webhooks.find(wh => wh.name === shape.displayName)
        if (!webhook) {
            let avatar: string | undefined
            try {
                avatar = this.getShapeAvatarUrl(shape.id)
            } catch {
                avatar = undefined
            }
            webhook = await channel.createWebhook({
                name: shape.displayName,
                avatar
            })
        }
        return webhook
    }

    /**
     * Enable duel mode between two shapes in a specific channel
     */
    public async enableDuelMode(shapeA: string, shapeB: string, channelId: string) {
        if (!this.shapes.has(shapeA) || !this.shapes.has(shapeB)) {
            throw new Error('Both shapes must be loaded before enabling duel mode')
        }
        this.duelMode = true
        this.duelChannelId = channelId
        this.duelShapes = [shapeA, shapeB]
        this.duelLastSpeaker = null
        this.duelConversation = []
        this.duelLastSent = 0

        let shapeAData: ShapesIncShape
        try {
            shapeAData = await this.fetchShapeByUsername(shapeA)
        } catch (err) {
            logger.error(`{enableDuelMode} Failed to fetch full shapeA data: ${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
            return
        }
        const initialMessage = shapeAData.shape_settings?.shape_initial_message
        if (initialMessage && this.duelChannelId) {
            // Add to duelConversation
            this._addToDuelConversation({
                author: shapeA,
                content: initialMessage,
                isShape: true,
                timestamp: Date.now()
            })
            // Send to Discord
            try {
                const webhook = await this.getOrCreateWebhookForShape(shapeA, this.duelChannelId)
                const avatar = this.getShapeAvatarUrl(shapeAData.id)
                await webhook.send({
                    content: initialMessage,
                    username: shapeAData.name,
                    avatarURL: avatar,
                    allowedMentions: { repliedUser: false, parse: [] }
                })
                this.duelLastSpeaker = shapeA // Mark shapeA as the last speaker
                this.duelLastSent = Date.now()
                // Trigger the next shape's turn automatically
                await this._processDuelTurn()
            } catch (err) {
                logger.error(`{enableDuelMode} Failed to send initial duel message: ${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
            }
        }
    }
    /**
     * Disable duel mode
     */
    public disableDuelMode() {
        this.duelMode = false
        this.duelChannelId = null
        this.duelShapes = null
        this.duelLastSpeaker = null
        this.duelConversation = []
        this.duelLastSent = 0
    }
    /**
     * Returns whether duel mode is enabled
     */
    public isDuelModeEnabled() {
        return this.duelMode
    }

    private _addToDuelConversation(entry: { author: string, content: string, isShape: boolean, timestamp: number }) {
        this.duelConversation.push(entry)
        if (this.duelConversation.length > 100) {
            this.duelConversation.shift()
        }
    }

    private async _processDuelTurn() {
        if (!this.duelMode || !this.duelChannelId || !this.duelShapes) return
        // Enforce min interval
        const now = Date.now()
        const sinceLast = now - this.duelLastSent
        if (sinceLast < this.DUEL_MIN_INTERVAL_MS) {
            await new Promise(res => setTimeout(res, this.DUEL_MIN_INTERVAL_MS - sinceLast))
        }
        // Determine which shape should reply
        let nextShape: string
        if (!this.duelLastSpeaker) {
            // First user message after duel start: shapeA replies
            nextShape = this.duelShapes[0]
        } else {
            nextShape = this.duelLastSpeaker === this.duelShapes[0] ? this.duelShapes[1] : this.duelShapes[0]
        }
        // Get the last message in the conversation (from user)
        const lastMsg = this.duelConversation[this.duelConversation.length - 1]
        // Compose the prompt for the shape
        const prompt = lastMsg.content
        // Get shape reply
        let reply = ''
        try {
            reply = await this.sendMessageAPI(prompt, undefined, nextShape)
        } catch (err) {
            logger.error(`{duel} Error getting shape reply: ${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
            reply = '...'
        }
        // Add shape reply to conversation
        this._addToDuelConversation({
            author: nextShape,
            content: reply,
            isShape: true,
            timestamp: Date.now()
        })
        // Send shape reply to Discord
        try {
            const webhook = await this.getOrCreateWebhookForShape(nextShape, this.duelChannelId)
            const avatar = this.getShapeAvatarUrl(this.shapes.get(nextShape)!.id)
            await webhook.send({
                content: reply || '...',
                username: this.shapes.get(nextShape)!.displayName,
                avatarURL: avatar,
                allowedMentions: { repliedUser: true, parse: ['users'] }
            })
            this.duelLastSpeaker = nextShape
            this.duelLastSent = Date.now()
        } catch (err) {
            logger.error(`{duel} Error sending duel reply: ${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
        }
    }

}
