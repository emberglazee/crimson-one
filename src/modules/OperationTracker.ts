import { Logger } from '../util/logger'
const logger = new Logger('OperationTracker')

type OperationType = 'SLASH_COMMAND' | 'TEXT_COMMAND' | 'TASK' | 'JOB' | 'EVENT' | 'OTHER'
type OperationStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'

interface Operation {
    id: string
    type: OperationType
    name: string
    start: Date
    status: OperationStatus
    metadata?: Record<string, unknown>
    refable?: { ref(): void; unref(): void }
}

export class OperationTracker {
    private static instance: OperationTracker
    private operations = new Map<string, Operation>()
    private shuttingDown = false
    private shutdownCallbacks: (() => Promise<void>)[] = []
    private shutdownPromise: Promise<void> | null = null
    private resolveShutdown: (() => void) | null = null

    private constructor() {
        this.shutdownPromise = new Promise(resolve => {
            this.resolveShutdown = resolve
        })
    }

    public static getInstance(): OperationTracker {
        if (!OperationTracker.instance) {
            OperationTracker.instance = new OperationTracker()
        }
        return OperationTracker.instance
    }

    public async track<T>(
        operationName: string,
        operationType: OperationType = 'TASK',
        operation: () => Promise<T>,
        metadata?: Record<string, unknown>
    ): Promise<T> {
        if (this.shuttingDown) {
            throw new Error('Bot is shutting down, new operations are blocked')
        }

        const opId = this.generateOperationId(operationType)
        const refable = {
            ref() { },
            unref() { }
        }
        this.addOperation(opId, operationName, operationType, { ...metadata, refable })
        process.ref(refable)

        try {
            const result = await operation()
            this.updateOperationStatus(opId, 'COMPLETED')
            return result
        } catch (error) {
            this.updateOperationStatus(opId, 'FAILED', {
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        } finally {
            const op = this.operations.get(opId)
            if (op?.refable) {
                process.unref(op.refable)
            }
            this.removeOperation(opId)
        }
    }

    public createTrackedOperation(
        operationName: string,
        operationType: OperationType = 'TASK',
        metadata?: Record<string, unknown>
    ) {
        if (this.shuttingDown) {
            throw new Error('Bot is shutting down, new operations are blocked')
        }

        const opId = this.generateOperationId(operationType)
        const refable = {
            ref() { },
            unref() { }
        }
        this.addOperation(opId, operationName, operationType, { ...metadata, refable })
        process.ref(refable)

        return {
            id: opId,
            complete: () => {
                const op = this.operations.get(opId)
                if (op?.refable) {
                    process.unref(op.refable)
                }
                this.updateOperationStatus(opId, 'COMPLETED')
                this.removeOperation(opId)
            },
            fail: (error: unknown) => {
                const op = this.operations.get(opId)
                if (op?.refable) {
                    process.unref(op.refable)
                }
                this.updateOperationStatus(opId, 'FAILED', {
                    error: error instanceof Error ? error.message : String(error)
                })
                this.removeOperation(opId)
            }
        }
    }

    public getPendingOperations(): Operation[] {
        return Array.from(this.operations.values())
    }

    public beginShutdown(): void {
        if (this.shuttingDown) return
        this.shuttingDown = true
        logger.warn('Shutdown initiated. Blocking new operations.')
    }

    public isShuttingDown(): boolean {
        return this.shuttingDown
    }

    public registerShutdownCallback(callback: () => Promise<void>): void {
        this.shutdownCallbacks.push(callback)
    }

    public async awaitShutdown(): Promise<void> {
        if (this.shutdownPromise) {
            return this.shutdownPromise
        }
        return Promise.resolve()
    }

    public async executeShutdown(): Promise<void> {
        this.beginShutdown()

        for (const callback of this.shutdownCallbacks) {
            try {
                await callback()
            } catch (err) {
                logger.error(`Error in shutdown callback: ${err instanceof Error ? err.message : String(err)}`)
            }
        }

        // Wait for pending operations with timeout
        const maxWaitTime = 30000
        const checkInterval = 1000
        let waited = 0

        while (this.operations.size > 0 && waited < maxWaitTime) {
            const pendingCount = this.operations.size
            logger.warn(`Waiting for ${pendingCount} operations to complete...`)
            await new Promise(resolve => setTimeout(resolve, checkInterval))
            waited += checkInterval
        }

        if (this.operations.size > 0) {
            logger.error(`Force shutdown with ${this.operations.size} operations pending`)
            this.logPendingOperations()
        }

        // Unref all remaining operations
        for (const op of this.operations.values()) {
            if (op.refable) {
                process.unref(op.refable)
            }
        }

        if (this.resolveShutdown) {
            this.resolveShutdown()
        }
    }

    private generateOperationId(type: OperationType): string {
        return `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    }

    private addOperation(
        id: string,
        name: string,
        type: OperationType,
        metadata?: Record<string, unknown>
    ): void {
        this.operations.set(id, {
            id,
            type,
            name,
            start: new Date(),
            status: 'RUNNING',
            metadata
        })
        logger.info(`Started operation ${id} (${type}: ${name})`)
    }

    private updateOperationStatus(
        id: string,
        status: 'COMPLETED' | 'FAILED',
        metadata?: Record<string, unknown>
    ): void {
        const op = this.operations.get(id)
        if (op) {
            op.status = status
            if (metadata) op.metadata = { ...op.metadata, ...metadata }
            logger.info(`Operation ${id} status updated to ${status}`)
        }
    }

    private removeOperation(id: string): void {
        this.operations.delete(id)
    }

    private logPendingOperations(): void {
        const pendingOps = this.getPendingOperations()
        if (pendingOps.length === 0) return

        logger.warn('Pending operations:')
        pendingOps.forEach(op => {
            const duration = (Date.now() - op.start.getTime()) / 1000
            logger.warn(
                `- ${op.id} (${op.type}: ${op.name}) ` +
                `Running for ${duration.toFixed(1)}s ` +
                `Status: ${op.status} ` +
                `${op.metadata ? JSON.stringify(op.metadata) : ''}`
            )
        })
    }
}

export const operationTracker = OperationTracker.getInstance()
