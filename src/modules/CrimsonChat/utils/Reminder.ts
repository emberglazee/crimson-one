import { Client } from 'discord.js'
import { Logger } from '../../../util/logger'
import { parse as chronoParse } from 'chrono-node'
import CrimsonChat from '../index'

const logger = new Logger('Reminder')

export interface ReminderData {
    id: string
    userId: string
    username: string
    message: string
    triggerTime: number
}

export class ReminderManager {
    private static instance: ReminderManager
    private reminders: Map<string, NodeJS.Timer>
    private client: Client | null = null

    private constructor() {
        this.reminders = new Map()
    }

    public static getInstance(): ReminderManager {
        if (!ReminderManager.instance) {
            ReminderManager.instance = new ReminderManager()
        }
        return ReminderManager.instance
    }

    public setClient(client: Client) {
        this.client = client
    }

    public async createReminder(data: ReminderData): Promise<void> {
        if (!this.client) throw new Error('Client not set')

        const now = Date.now()
        const delay = data.triggerTime - now

        if (delay <= 0) {
            throw new Error('Reminder time must be in the future')
        }

        const timeout = setTimeout(async () => {
            try {
                const crimsonChat = CrimsonChat.getInstance()
                const reminderMessage = `A reminder has been triggered for the user ${data.username}: \`${data.message}\``

                await crimsonChat.sendMessage(reminderMessage, {
                    username: 'Reminder System',
                    displayName: 'Reminder',
                    serverDisplayName: 'Reminder'
                })

                this.reminders.delete(data.id)
            } catch (error) {
                logger.error(`Failed to send reminder ${data.id}: ${error}`)
            }
        }, delay)

        this.reminders.set(data.id, timeout)
        logger.info(`Created reminder ${data.id} for ${new Date(data.triggerTime).toISOString()}`)

        // Notify that reminder was set
        const crimsonChat = CrimsonChat.getInstance()
        await crimsonChat.sendMessage(
            `⏰ Set a reminder for <@${data.userId}> at ${new Date(data.triggerTime).toLocaleString()}: ${data.message}`,
            {
                username: 'Reminder System',
                displayName: 'Reminder',
                serverDisplayName: 'Reminder'
            }
        )
    }

    public cancelReminder(id: string): boolean {
        const timeout = this.reminders.get(id)
        if (timeout) {
            clearTimeout(timeout)
            this.reminders.delete(id)
            logger.info(`Cancelled reminder ${id}`)
            return true
        }
        return false
    }

    public parseTime(timeStr: string, timezone?: string): Date | null {
        const parsed = chronoParse(`${timeStr} ${timezone}`, undefined)
        return parsed[0]?.date() || null
    }
}
