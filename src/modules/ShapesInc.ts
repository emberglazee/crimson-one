// connect the web interface of shapes.inc (fancier version of character.ai) with the discord bot
import { Logger } from '../util/logger'
const logger = new Logger('ShapesInc')

import { inspect } from 'util'

import type { ShapesIncGetChatHistoryResponse, ShapesIncSendMessageResponse, ShapesIncClearChatResponse, ShapesIncShape } from '../types/types'
import fs from 'fs/promises'
import path from 'path'
import { parseNetscapeCookieFile } from '../util/functions'

export default class ShapesInc {
    private static instance: ShapesInc
    private constructor() {}
    private cookies!: string
    public userId = 'ab8f795b-cc33-4189-9430-a6917bb85398'
    public shapeId = 'c4fa29df-aa29-40f7-baaa-21f2e3aab46b'
    public shapeVanity = 'crimson-1'

    static getInstance(): ShapesInc {
        if (!ShapesInc.instance) {
            ShapesInc.instance = new ShapesInc()
        }
        return ShapesInc.instance
    }

    async init() {
        // Only load cookies from file (Netscape format)
        const cookiesPath = path.join(__dirname, '../../data/shapesinc-cookies.txt')
        try {
            const cookiesTxt = await fs.readFile(cookiesPath, 'utf-8')
            // Parse and join cookies for fetch header
            const cookiesArr = parseNetscapeCookieFile(cookiesTxt)
            this.cookies = cookiesArr.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
            logger.ok('{init} Loaded cookies from file (Netscape format)')
        } catch (err) {
            logger.error(`{init} Failed to load cookies from file: ${err}`)
            throw err
        }
    }

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
    
    async fetchShapeByVanity(vanity: string) {
        const url = `https://shapes.inc/api/shapes/username/${vanity}`
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
        this.shapeVanity = data.username
    }
    public async changeShapeByVanity(vanity: string) {
        const data = await this.fetchShapeByVanity(vanity)
        this.shapeId = data.id
        this.shapeVanity = data.username
    }
}
