import { Logger, yellow, red } from '../util/logger'
const logger = new Logger('GracefulShutdown')

import { operationTracker } from './OperationTracker'
import { Client } from 'discord.js'
import { DashboardServer } from './DashboardServer'

export class GracefulShutdown {
    private static instance: GracefulShutdown
    private client: Client | null = null
    private refable = {
        ref() { },
        unref() { }
    }

    private constructor() {
        process.ref(this.refable)
    }

    public static getInstance(): GracefulShutdown {
        if (!GracefulShutdown.instance) {
            GracefulShutdown.instance = new GracefulShutdown()
        }
        return GracefulShutdown.instance
    }

    public setClient(client: Client): void {
        this.client = client
    }

    public async shutdown(signal: string): Promise<void> {
        if (!this.client) {
            logger.warn('Client not set for graceful shutdown! => process.exit(1)')
            process.exit(1)
        }

        logger.warn(`Received ${yellow(signal)}, initiating a graceful shutdown...`)

        try {
            if (this.client.user) {
                // for some reason these are not async?
                this.client.user.setStatus('dnd')
                this.client.user.setActivity('Shutting down...')
            }
        } catch (error) {
            logger.warn(`Could not update bot status: ${red(error instanceof Error ? error.message : String(error))}`)
        }

        await operationTracker.executeShutdown()

        DashboardServer.getInstance().stop()

        try {
            this.client.destroy()
            logger.ok('Discord client destroyed')
        } catch (error) {
            logger.warn(`Could not destroy client: ${red(error instanceof Error ? error.message : String(error))}`)
        }

        // Unref the process to allow it to exit cleanly
        process.unref(this.refable)
        process.exit(0)
    }

    public registerShutdownHandlers(): void {
        process.on('SIGTERM', () => this.shutdown('SIGTERM'))
        process.on('SIGINT', () => this.shutdown('SIGINT'))
        process.on('SIGUSR2', () => this.shutdown('SIGUSR2'))
    }
}

export const gracefulShutdown = GracefulShutdown.getInstance()
