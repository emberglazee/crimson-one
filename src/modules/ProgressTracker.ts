import { type CommandContext } from './CommandManager/CommandContext'
import { InteractionMessageManager } from './InteractionMessageManager'
import { formatTimeRemaining } from '../util/functions'
import { type MessageEditOptions } from 'discord.js'

const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000
const SAFETY_MARGIN_MS = 1 * 60 * 1000

export class ProgressTracker {
    private readonly title: string
    private messageManager: InteractionMessageManager
    private readonly startTime: number
    private stepTimes: number[] = []
    private lastUpdateTime = 0
    private readonly UPDATE_INTERVAL = 1500

    constructor(ctx: CommandContext, title: string) {
        this.title = title
        this.messageManager = new InteractionMessageManager(ctx)
        this.startTime = Date.now()
    }

    private createProgressBar(progress: number, barLength = 20): string {
        const filledLength = Math.max(0, Math.min(barLength, Math.round(barLength * progress)))
        const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
        const percentage = (progress * 100).toFixed(1)
        return `${bar} ${percentage}%`
    }

    private calculateETA(current: number, total: number): string | null {
        if (this.stepTimes.length === 0 || current === 0) return null

        const avgStepTime = this.stepTimes.reduce((a, b) => a + b, 0) / this.stepTimes.length
        const remainingSteps = total - current
        if (remainingSteps <= 0) return null

        const etaSeconds = (avgStepTime * remainingSteps) / 1000
        return formatTimeRemaining(etaSeconds)
    }

    public recordStep() {
        const now = Date.now()
        const lastStepTime = this.stepTimes.length > 0 ? this.startTime + this.stepTimes.reduce((a,b) => a + b, 0) : this.startTime
        this.stepTimes.push(now - lastStepTime)
    }

    public async update(options: {
        current: number
        total?: number
        percent?: number
        statusText?: string
        eta?: string | null
        fetched?: number
        ignored?: number
    }) {
        const now = Date.now()

        const elapsedMs = now - this.startTime
        if (elapsedMs > INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS && !this.messageManager.isUsingFollowUp) {
            this.messageManager.switchToFollowUp()
        }

        if (now - this.lastUpdateTime < this.UPDATE_INTERVAL && (options.total && options.current !== options.total)) {
            return
        }
        this.lastUpdateTime = now

        const eta = options.eta ?? (options.total ? this.calculateETA(options.current, options.total) : null)

        let message = `**${this.title}**\n`

        if (options.fetched !== undefined) {
            message += (
                `*${options.statusText || 'Scanning messages...'}*\n` +
                '```\n' +
                `- Fetched:   ${options.fetched.toLocaleString()}\n` +
                `- Collected: ${options.current.toLocaleString()}\n` +
                `- Ignored:   ${options.ignored?.toLocaleString() ?? 'N/A'}\n` +
                '```'
            )
        } else {
            let progress = 0
            if (options.percent !== undefined) {
                progress = options.percent / 100
            } else if (options.total !== undefined && options.total > 0) {
                progress = options.current / options.total
            }

            const progressBar = this.createProgressBar(progress)
            message += progressBar

            if (options.total) {
                message += ` (${options.current}/${options.total})`
            } else {
                message += ` (${options.current} items)`
            }

            if (options.statusText) {
                message += `\n*${options.statusText}*`
            }
        }

        if (eta) {
            message += `\n⏱️ ETA: ${eta}`
        }

        await this.messageManager.updateMessage(message)
    }

    public async finish(options: string | MessageEditOptions) {
        await this.messageManager.sendFinalMessage(typeof options === 'string' ? { content: options } : options)
    }
}
