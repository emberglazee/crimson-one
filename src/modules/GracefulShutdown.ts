import { singleton, inject } from 'tsyringe'
import { Logger } from './Logger'
import { yellow, red } from '../util/colors'
const logger = new Logger('GracefulShutdown')

import { OperationTracker } from './'
import { Client } from 'discord.js'
import { DashboardServer } from './DashboardServer'

@singleton()
export class GracefulShutdown {
    private refable = {
        ref() { },
        unref() { }
    }

    public constructor(
        @inject('Client') private client: Client,
        private operationTracker: OperationTracker,
        private dashboardServer: DashboardServer
    ) {
        process.ref(this.refable)
    }

    public async shutdown(signal: string): Promise<void> {
        if (!this.client) {
            logger.warn('The client is not set for graceful shutdown. Exiting with code 1.')
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

        await this.operationTracker.executeShutdown()
        this.dashboardServer.stop()

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
