// connect the web interface of shapes.inc (fancier version of character.ai) with the discord bot
import { green, Logger, red } from '../util/logger'
const logger = new Logger('ShapesInc')

import { inspect } from 'util'
import { chromium, type Browser, type Page } from 'playwright'
const { SHAPES_INC_EMAIL, SHAPES_INC_PASSWORD } = process.env

import type { ShapesIncGetChatHistoryResponse, ShapesIncSendMessageResponse, ShapesIncClearChatResponse } from '../types/types'
import fs from 'fs/promises'
import path from 'path'

export default class ShapesInc {
    private static instance: ShapesInc
    private constructor() {}
    private browser!: Browser
    private page!: Page
    private cookies!: string
    private userId = 'ab8f795b-cc33-4189-9430-a6917bb85398' as const
    private shapeId = 'c4fa29df-aa29-40f7-baaa-21f2e3aab46b' as const
    private shapeVanity = 'crimson-1' as const
    private loggedIn = false

    static getInstance(): ShapesInc {
        if (!ShapesInc.instance) {
            ShapesInc.instance = new ShapesInc()
        }
        return ShapesInc.instance
    }

    async init() {
        logger.info('{init} Launching chromium...')
        this.browser = await chromium.launch({ headless: true })
        logger.info('{init} Opening new page...')
        this.page = await this.browser.newPage()
        // Try to load cookies from file
        const cookiesPath = path.join(__dirname, '../../data/shapesinc-cookies.txt')
        if (await fs.exists(cookiesPath)) {
            try {
                const cookiesTxt = await fs.readFile(cookiesPath, 'utf-8')
                // Convert cookie string to array of cookie objects for Playwright
                const cookies = cookiesTxt.split('; ').map(cookieStr => {
                    const [name, ...rest] = cookieStr.split('=')
                    return { name, value: rest.join('='), domain: '.shapes.inc', path: '/' }
                })
                await this.page.context().addCookies(cookies)
                logger.ok('{init} Loaded cookies from file')
            } catch (err) {
                logger.warn(`{init} Failed to load cookies from file: ${err}`)
            }
        }
        logger.info('{init} Checking if logged in...')
        this.loggedIn = await this.webCheckIfLoggedIn() || await this.apiCheckIfLoggedIn()
        if (!this.loggedIn) await this.webLogin()
        // Save cookies after login or check
        try {
            const cookies = await this.page.context().cookies()
            const cookiesTxt = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
            await fs.writeFile(cookiesPath, cookiesTxt, 'utf-8')
            logger.ok('{init} Saved cookies to file')
        } catch (err) {
            logger.warn(`{init} Failed to save cookies to file: ${err}`)
        }
        logger.ok('{init} Done')
    }

    async close() {
        await this.browser.close()
    }

    async webCheckIfLoggedIn() {
        logger.info('{webCheckIfLoggedIn} Going to shapes.inc...')
        await this.page.goto('https://shapes.inc/')
        logger.info('{webCheckIfLoggedIn} Waiting for networkidle...')
        await this.page.waitForLoadState('networkidle')
        logger.info('{webCheckIfLoggedIn} Evaluating if logged in...')
        const isLoggedIn = await this.page.evaluate(
            (email: string) => {
                return document.querySelector('body > div:nth-child(1) > div.topNav_wrapper__LWmvo > div > nav > div.topNav_navRight__rgh1s > div > div > span')?.textContent === email
            },
            SHAPES_INC_EMAIL!
        )
        logger.info(`{webCheckIfLoggedIn} ${isLoggedIn ? green('Logged in') : red('Not logged in')}`)
        return isLoggedIn
    }
    // simpler
    async apiCheckIfLoggedIn() {
        logger.info('{apiCheckIfLoggedIn} API request...')
        const req = await fetch('https://shapes.inc/api/auth/me')
        logger.info(`{apiCheckIfLoggedIn} Status: ${req.status}; ${req.status === 200 ? 'logged in' : 'not logged in'}`)
        return req.status === 200 // `200 ok` if logged in, `204 no content` if not
    }

    async webLogin() {
        if (this.loggedIn) {
            logger.ok('{webLogin} already logged in bro tf you doin')
            return
        }
        logger.info('{webLogin} Going to shapes.inc/api/auth/login-password...')
        await this.page.goto('https://shapes.inc/api/auth/login-password')
        // redirect to https://auth.shapes.inc/u/login?state=<auth_state_string>
        logger.info('{webLogin} Waiting for networkidle...')
        await this.page.waitForLoadState('networkidle')
        logger.info('{webLogin} Filling in username...')
        await this.page.fill('#username', SHAPES_INC_EMAIL!)
        await this.page.fill('#password', SHAPES_INC_PASSWORD!)
        logger.info('{webLogin} Clicking login button...')
        await this.page.click('body > div > main > section > div > div > div > form > div.cd7628f16 > button')
        // first redirect to https://shapes.inc/, then to https://shapes.inc/explore
        logger.info('{webLogin} Waiting for networkidle...')
        await this.page.waitForLoadState('networkidle')
        logger.ok('{webLogin} Done')
    }

    // Extract cookies from the current page in a format suitable for fetch()'s 'cookie' header
    async getCookiesForFetch(): Promise<string> {
        if (!this.page) throw new Error('Page not initialized')
        if (this.cookies) {
            logger.ok('{getCookiesForFetch} Cookies already present')
            return this.cookies
        }
        logger.info('{getCookiesForFetch} Getting cookies...')
        // Try to load cookies from file if not already loaded
        const cookiesPath = path.join(__dirname, '../../data/shapesinc-cookies.txt')
        if (await fs.exists(cookiesPath)) {
            try {
                const cookiesTxt = await fs.readFile(cookiesPath, 'utf-8')
                this.cookies = cookiesTxt.trim()
                logger.ok('{getCookiesForFetch} Loaded cookies from file')
                return this.cookies
            } catch (err) {
                logger.error(`{getCookiesForFetch} Failed to load cookies from file: ${err}`)
            }
        }
        // Fallback: get from browser context
        const cookies = await this.page.context().cookies()
        this.cookies = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
        logger.ok('{getCookiesForFetch} Done')
        return this.cookies
    }

    // the target shape (context: project wingman character)
    async gotoCrimson1() {
        logger.info('{gotoCrimson1} Going to Crimson 1\'s page...')
        await this.page.goto(`https://shapes.inc/${this.shapeVanity}/chat`)
        logger.info('{gotoCrimson1} Waiting for networkidle...')
        await this.page.waitForLoadState('networkidle')
        logger.ok('{gotoCrimson1} Done')
    }

    async sendMessage(message: string, attachment_url: string | null = null): Promise<ShapesIncSendMessageResponse> {
        logger.info('{sendMessage} Sending message...')
        const url = `https://shapes.inc/api/shapes/${this.shapeId}/chat`
        const body = JSON.stringify({
            message,
            shapeId: this.shapeId,
            attachment_url
        })
        const cookies = await this.getCookiesForFetch()
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
    async clearChat(ts: number): Promise<ShapesIncClearChatResponse> {
        logger.info('{clearChat} Clearing chat...')
        const url = `https://shapes.inc/api/shapes/${this.shapeId}/wack`
        const body = JSON.stringify({
            shapeId: this.shapeId,
            ts,
            user_id: this.userId
        })
        const cookies = await this.getCookiesForFetch()
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
        const cookies = await this.getCookiesForFetch()
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'cookie': cookies
            }
        })
        logger.ok('{getChatHistory} Done')
        return res.json() as Promise<ShapesIncGetChatHistoryResponse<20>>
    }
}
