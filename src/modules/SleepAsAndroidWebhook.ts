import { singleton, inject } from 'tsyringe'
import { Logger } from './Logger'
import { yellow } from '../util/colors'
const logger = new Logger('SleepAsAndroidWebhook')

import { EventEmitter } from 'tseep'
import type { IncomingMessage, Server, ServerResponse } from 'http'
import { createServer } from 'http'
import { Client, EmbedBuilder, type TextChannel } from 'discord.js'
import { PING_EMBI } from '../util/constants'

// Define a custom event type for Sleep as Android events
type SleepWebhookEvents = {
    sleepEvent: (payload: { event: string, [key: string]: string | undefined }) => void
    error: (error: Error) => void
} & { [key: string]: (...args: unknown[]) => void }

@singleton()
export class SleepAsAndroidWebhookManager extends EventEmitter<SleepWebhookEvents> {
    private server: Server
    private port: number = 0
    private channel: TextChannel | null = null

    public constructor(@inject('Client') private client: Client) {
        super()
        this.server = createServer(this.handleRequest.bind(this))
    }

    public setWebhookOptions(options: {
        port: number
    }): SleepAsAndroidWebhookManager {
        this.port = options.port
        return this
    }

    public async init() {
        if (!this.client) {
            throw new Error('Client not set. Call setClient() first.')
        }
        // Using the same channel as GithubWebhook for now, can be made configurable later
        this.channel = await this.client.channels.fetch('1331556083776487444') as TextChannel
        if (!this.channel) {
            throw new Error('Could not find webhook channel')
        }

        this.on('sleepEvent', async payload => {
            logger.info(`Received Sleep as Android event: ${yellow(payload.event)}`)
            const embed = new EmbedBuilder()
                .setTitle(payload.event)
                .setAuthor({
                    name: 'Sleep as Android',
                    iconURL: 'https://cdn.discordapp.com/attachments/982138135653793804/1421619724629835876/8T390CJk1L29Cq3POAzSCHhxYg7AqUCKam8xSHc-sEtIL5RQNVv77ZzKFbMU3pXFFA4w3840-896402765.png?ex=68d9b20a&is=68d8608a&hm=d6d8e2174be73453b055c2afdbfacbe63be46ee448e8d4a5d42760243e3280c6&',
                    url: 'https://play.google.com/store/apps/details?id=com.urbandroid.sleep'
                })
                .setColor('#7289DA') // Discord blurple color
                .setTimestamp()

            switch (payload.event) {
                case 'alarm_rescheduled': {
                    embed.setTitle('⏰ Alarm changed')
                    const timestamp = payload.value1
                    const alarmName = payload.value2 || 'Default Alarm'

                    if (timestamp) {
                        const date = new Date(parseInt(timestamp))
                        embed.addFields(
                            { name: '📛 Alarm Name', value: alarmName, inline: true },
                            { name: '⌛ Rescheduled To', value: date.toLocaleString('ru', { timeZone: 'Europe/Moscow' }), inline: true }
                        )
                    } else embed.setDescription('❌ Alarm turned off.')
                    break
                }
                case 'sleep_tracking_started':
                    embed.setTitle('😴 Sleep tracking started')
                    break
                case 'sleep_tracking_stopped':
                    embed.setTitle('😴 Sleep tracking stopped')
                    break
                case 'before_smart_period': {
                    embed.setTitle('😴 Smart period about to start')
                    embed.setDescription('🔎 Finding an optimal moment to wake up based on sleep phases')

                    const timestamp = payload.value1
                    const alarmName = payload.value2 || 'Default Alarm'

                    if (alarmName) embed.addFields({ name: '📛 Alarm Name', value: alarmName, inline: true })
                    if (timestamp) {
                        const date = new Date(parseInt(timestamp))
                        embed.addFields({ name: '⌛ Set to', value: date.toLocaleString('ru', { timeZone: 'Europe/Moscow' }), inline: true })
                    }
                    break
                }
                case 'before_alarm':
                    embed.setTitle('⏰ Alarm about to go off')
                    break
                case 'smart_period':
                    embed.setTitle('😴🔎 Smart period started')
                    break
                case 'alarm_alert_started':
                    embed.setTitle('⏰ Alarm alert started')
                    break
                case 'alarm_alert_dismiss':
                    embed.setTitle('⏰ Alarm alert dismissed')
                    break
                case 'light_sleep':
                    embed.setTitle('😴 Light sleep phase')
                    break
                case 'deep_sleep':
                    embed.setTitle('😴 Deep sleep phase')
                    break
                case 'rem':
                    embed.setTitle('😴 REM sleep phase')
                    break
                case 'time_to_bed_alarm_alert':
                    embed.setTitle('🛌 Bed time alarm')
                    embed.setDescription(`${PING_EMBI} non negotiable, NOW`)
                    break
                case 'sound_event_talk':
                    embed.setTitle('🛌 Talking detected')
                    break
                case 'awake':
                    embed.setTitle('🥱 Woke up')
                    break
                case 'not_awake':
                    embed.setTitle('😴 Fell asleep')
                    break
                case 'apnea_alarm':
                    embed.setTitle('⚠️ Apnea alarm')
                    embed.setDescription('This better be a drill')
                    break
                default:
                    for (const key in payload) {
                        if (key !== 'event' && payload[key]) {
                            embed.addFields({ name: key, value: payload[key], inline: true })
                        }
                    }
                    break
            }

            await this.channel?.send({ embeds: [embed] })
        })

        await this.start()
        logger.ok(`Sleep as Android webhook initialized and listening on port ${yellow(this.port)}`)
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse) {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'text/plain' })
            res.end('Method not allowed')
            return
        }

        const expectedUsername = process.env.SLEEP_WEBHOOK_USERNAME
        const expectedPassword = process.env.SLEEP_WEBHOOK_PASSWORD

        if (!expectedUsername || !expectedPassword) {
            logger.error('SLEEP_WEBHOOK_USERNAME or SLEEP_WEBHOOK_PASSWORD not set in environment variables.')
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Server configuration error.')
            return
        }

        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SleepAsAndroid Webhook"' })
            res.end('Unauthorized')
            return
        }

        const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
        const [username, password] = credentials.split(':')

        if (username !== expectedUsername || password !== expectedPassword) {
            res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SleepAsAndroid Webhook"' })
            res.end('Unauthorized')
            return
        }

        let payload = ''
        req.on('data', chunk => {
            payload += chunk.toString()
        })

        req.on('end', () => {
            try {
                console.log(payload)

                const parsedPayload = JSON.parse(payload)
                // Validate payload format: { event: string, [valueX: string]: string }
                if (typeof parsedPayload.event !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'text/plain' })
                    res.end('Invalid payload format: missing or invalid "event" field')
                    return
                }

                this.emit('sleepEvent', parsedPayload)

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
