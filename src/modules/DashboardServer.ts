import { Logger } from './Logger'
import { OperationTracker } from './OperationTracker'
import { AWACSFeed } from './AWACSFeed'
import { CrimsonChat } from './CrimsonChat'
import type { LogPayload } from '../types'
import { red, yellow } from '../util/colors'
const logger = new Logger('DashboardServer')

import { WebSocketServer, WebSocket } from 'ws'
import type { Client } from 'discord.js'

const operationTracker = OperationTracker.getInstance()
const awacsFeed = AWACSFeed.getInstance()
const crimsonChat = CrimsonChat.getInstance()

export class DashboardServer {
    private static instance: DashboardServer
    private wss: WebSocketServer | null = null
    client!: Client

    private constructor() {}

    public static getInstance(): DashboardServer {
        if (!DashboardServer.instance) {
            DashboardServer.instance = new DashboardServer()
        }
        return DashboardServer.instance
    }

    public setClient(client: Client) {
        this.client = client
    }

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

        operationTracker.on('operationStart', () => this.sendOperations())
        operationTracker.on('operationEnd', () => this.sendOperations())

        awacsFeed.on('awacsEvent', message => this.sendAwacsEvent(message))
        crimsonChat.on('statusChange', () => this.sendCrimsonChatStatus())

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
                enabled: crimsonChat.state.enabled,
                model: crimsonChat.state.modelName,
                history: {
                    mode: crimsonChat.state.limitMode,
                    count: crimsonChat.state.history.length,
                    limit: crimsonChat.state.limitMode === 'messages' ? crimsonChat.state.messageLimit : crimsonChat.state.tokenLimit
                },
                modes: [
                    crimsonChat.state.berserkMode ? 'BERSERK' : null,
                    crimsonChat.state.testMode ? 'TEST MODE' : null
                ].filter(Boolean)
            }
        })
    }

    private sendOperations() {
        const operationTracker = OperationTracker.getInstance()
        this.broadcast({
            type: 'operations_update',
            timestamp: new Date().toISOString(),
            payload: operationTracker.getPendingOperations().map(op => ({
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
