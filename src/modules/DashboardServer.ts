import { singleton, inject } from 'tsyringe'
import { Logger } from './Logger'
import { OperationTracker } from './OperationTracker'
import { AWACSFeed } from './AWACSFeed'
import { CrimsonChat } from './CrimsonChat'
import type { LogPayload } from '../types'
import { red, yellow } from '../util/colors'
const logger = new Logger('DashboardServer')

import { WebSocketServer, WebSocket } from 'ws'
import type { Client } from 'discord.js'

@singleton()
export class DashboardServer {
    private wss: WebSocketServer | null = null

    public constructor(
        @inject('Client') private client: Client,
        private operationTracker: OperationTracker,
        private awacsFeed: AWACSFeed,
        private crimsonChat: CrimsonChat
    ) {}

    public start(port: number) {
        if (this.wss) {
            logger.warn('Dashboard WebSocket server is already running.')
            return
        }

        this.wss = new WebSocketServer({ port })

        this.wss.on('connection', ws => {
            logger.ok('Dashboard client connected.')
            this.sendStats()
            this.sendCrimsonChatStatus()
            this.sendOperations()
            ws.on('close', () => {
                logger.warn('Dashboard client disconnected.')
            })
            ws.on('error', error => {
                logger.error(`Dashboard client error: ${red(error.message)}`)
            })
        })

        setInterval(() => this.sendStats(), 5000)

        // Listen for events to broadcast
        Logger.events.on('log', (payload: LogPayload) => this.broadcastLog(payload))

        this.operationTracker.on('operationStart', () => this.sendOperations())
        this.operationTracker.on('operationEnd', () => this.sendOperations())

        this.awacsFeed.on('awacsEvent', message => this.sendAwacsEvent(message))
        this.crimsonChat.on('statusChange', () => this.sendCrimsonChatStatus())

        logger.ok(`Dashboard WebSocket server started on port ${yellow(port)}`)
    }

    private sendStats() {
        const { heapUsed, heapTotal, rss } = process.memoryUsage()
        const uptime = Math.floor(process.uptime())
        const application = this.client.application!

        this.broadcast({
            type: 'stats',
            timestamp: new Date().toISOString(),
            payload: {
                memory: {
                    heapUsed,
                    heapTotal,
                    rss
                },
                uptime,
                guilds: application.approximateGuildCount ?? 0,
                users: application.approximateUserInstallCount ?? 0
            }
        })
    }

    private sendCrimsonChatStatus() {
        this.broadcast({
            type: 'crimsonchat_status',
            timestamp: new Date().toISOString(),
            payload: {
                enabled: this.crimsonChat.state.enabled,
                model: this.crimsonChat.state.modelName,
                history: {
                    mode: this.crimsonChat.state.limitMode,
                    count: this.crimsonChat.state.history.length,
                    limit: this.crimsonChat.state.limitMode === 'messages' ? this.crimsonChat.state.messageLimit : this.crimsonChat.state.tokenLimit
                },
                modes: [
                    this.crimsonChat.state.berserkMode ? 'BERSERK' : null,
                    this.crimsonChat.state.testMode ? 'TEST MODE' : null
                ].filter(Boolean)
            }
        })
    }

    private sendOperations() {
        this.broadcast({
            type: 'operations_update',
            timestamp: new Date().toISOString(),
            payload: this.operationTracker.getPendingOperations().map(op => ({
                id: op.id,
                name: op.name,
                startTime: op.start.toISOString()
            }))
        })
    }

    private sendAwacsEvent(message: string) {
        this.broadcast({
            type: 'awacs_event',
            timestamp: new Date().toISOString(),
            payload: {
                message
            }
        })
    }

    private broadcastLog(log: LogPayload) {
        this.broadcast({
            type: 'log',
            timestamp: new Date().toISOString(),
            payload: {
                level: log.level.toUpperCase(),
                message: log.message,
                module: log.module
            }
        })
    }

    public broadcast(data: object) {
        if (!this.wss) return

        const message = JSON.stringify(data)
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message)
            }
        })
    }

    public stop() {
        if (this.wss) {
            this.wss.close()
            this.wss = null
            logger.info('Dashboard WebSocket server stopped.')
        }
    }
}
