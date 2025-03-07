// module for public audit logs stylized to Project Wingman

import { Client, TextChannel } from 'discord.js'
import type { ColorResolvable } from 'discord.js'
import { EventEmitter } from 'tseep'
import { Logger } from '../util/logger'
import chalk from 'chalk'

const logger = new Logger('AWACSFeed')

// Event types that can be handled by the AWACSFeed
type AWACSEvents = {
    memberJoin: (data: MemberJoinData) => void
    memberLeave: (data: MemberLeaveData) => void
    messageDelete: (data: MessageDeleteData) => void
    messageEdit: (data: MessageEditData) => void
    channelCreate: (data: ChannelData) => void
    channelDelete: (data: ChannelData) => void
    roleCreate: (data: RoleData) => void
    roleDelete: (data: RoleData) => void
    memberBan: (data: MemberActionData) => void
    memberUnban: (data: MemberActionData) => void
    memberTimeout: (data: MemberTimeoutData) => void
    error: (error: Error) => void
    custom: (data: CustomEventData) => void
}

// Data interfaces for different event types
interface MemberJoinData {
    memberId: string
    memberName: string
    guildId: string
    guildName: string
    joinedAt: Date
}

interface MemberLeaveData {
    memberId: string
    memberName: string
    guildId: string
    guildName: string
    leftAt: Date
}

interface MessageDeleteData {
    messageId: string
    channelId: string
    channelName: string
    authorId: string | null
    authorName: string | null
    content: string | null
    deletedAt: Date
}

interface MessageEditData {
    messageId: string
    channelId: string
    channelName: string
    authorId: string
    authorName: string
    oldContent: string | null
    newContent: string
    editedAt: Date
}

interface ChannelData {
    channelId: string
    channelName: string
    guildId: string
    guildName: string
    timestamp: Date
}

interface RoleData {
    roleId: string
    roleName: string
    roleColor: string | null
    guildId: string
    guildName: string
    timestamp: Date
}

interface MemberActionData {
    memberId: string
    memberName: string
    moderatorId: string | null
    moderatorName: string | null
    guildId: string
    guildName: string
    reason: string | null
    timestamp: Date
}

interface MemberTimeoutData extends MemberActionData {
    duration: number // timeout duration in milliseconds
}

interface CustomEventData {
    title: string
    description: string
    color?: ColorResolvable
    fields?: Array<{
        name: string
        value: string
        inline?: boolean
    }>
    timestamp?: Date
    footer?: string
    thumbnail?: string
    image?: string
}

// AWACSFeed class for audit logs
export class AWACSFeed extends EventEmitter<AWACSEvents> {
    private static instance: AWACSFeed
    private client: Client | null = null
    private channel: TextChannel | null = null
    private channelId: string | null = null
    private initialized = false

    // Message prefix emoji indicators
    private prefixEmoji = {
        success: '✅',
        warning: '⚠️',
        danger: '🚨',
        info: 'ℹ️',
    }

    private constructor() {
        super()
        this.setupEventHandlers()
    }

    public static getInstance(): AWACSFeed {
        if (!AWACSFeed.instance) {
            AWACSFeed.instance = new AWACSFeed()
        }
        return AWACSFeed.instance
    }

    public setClient(client: Client): void {
        this.client = client
    }

    public async init(client: Client, channelId: string): Promise<void> {
        this.client = client
        this.channelId = channelId

        try {
            const channel = await client.channels.fetch(channelId)
            if (!channel || !channel.isTextBased()) {
                throw new Error(`Channel with ID ${channelId} is not a text channel`)
            }

            this.channel = channel as TextChannel
            this.initialized = true

            logger.ok(`AWACS Feed initialized with channel: ${chalk.yellow(this.channel.name)}`)
        } catch (error) {
            logger.error(`Failed to initialize AWACS Feed: ${(error as Error).message}`)
            throw error
        }
    }

    // Change the channel where logs are sent
    public async setChannel(channelId: string): Promise<boolean> {
        if (!this.client) {
            logger.error('Client not set. Call setClient() first.')
            return false
        }

        try {
            const channel = await this.client.channels.fetch(channelId)
            if (!channel || !channel.isTextBased()) {
                throw new Error(`Channel with ID ${channelId} is not a text channel`)
            }

            this.channel = channel as TextChannel
            this.channelId = channelId

            logger.ok(`AWACS Feed channel changed to: ${chalk.yellow(this.channel.name)}`)
            return true
        } catch (error) {
            logger.error(`Failed to change AWACS Feed channel: ${(error as Error).message}`)
            return false
        }
    }

    // Get the current channel ID
    public getChannelId(): string | null {
        return this.channelId
    }

    // Set up all event handlers
    private setupEventHandlers(): void {
        this.on('memberJoin', this.handleMemberJoin.bind(this))
        this.on('memberLeave', this.handleMemberLeave.bind(this))
        this.on('messageDelete', this.handleMessageDelete.bind(this))
        this.on('messageEdit', this.handleMessageEdit.bind(this))
        this.on('channelCreate', this.handleChannelCreate.bind(this))
        this.on('channelDelete', this.handleChannelDelete.bind(this))
        this.on('roleCreate', this.handleRoleCreate.bind(this))
        this.on('roleDelete', this.handleRoleDelete.bind(this))
        this.on('memberBan', this.handleMemberBan.bind(this))
        this.on('memberUnban', this.handleMemberUnban.bind(this))
        this.on('memberTimeout', this.handleMemberTimeout.bind(this))
        this.on('custom', this.handleCustomEvent.bind(this))
        this.on('error', this.handleError.bind(this))
    }

    // Format a timestamp in Ace Combat/Project Wingman style (e.g., "1435hrs JAN.05.2025")
    private formatArcadeTimestamp(date: Date): string {
        const hours = date.getHours().toString().padStart(2, '0')
        const minutes = date.getMinutes().toString().padStart(2, '0')

        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
        const month = monthNames[date.getMonth()]

        const day = date.getDate().toString().padStart(2, '0')
        const year = date.getFullYear()

        return `${hours}${minutes}hrs ${month}.${day}.${year}`
    }

    // Generic method to send a simple text message
    private async sendMessage(options: {
        title: string,
        type: 'success' | 'warning' | 'danger' | 'info',
        content: string,
        timestamp?: Date,
        callsign?: string
    }): Promise<void> {
        if (!this.initialized || !this.channel) {
            logger.warn('AWACS Feed not initialized or channel not set')
            return
        }

        const { title, type, content, timestamp = new Date(), callsign } = options

        try {
            const prefix = this.prefixEmoji[type]
            const callsignPrefix = callsign ? `${callsign} | ` : ''
            const formattedTimestamp = this.formatArcadeTimestamp(timestamp)

            // Create a simple one-liner message with Project Wingman/Ace Combat style
            const message = `${prefix} **${callsignPrefix}${title.toUpperCase()}** | ${formattedTimestamp} | ${content}`

            await this.channel.send(message)
            logger.ok(`Sent AWACS log: ${chalk.yellow(title)}`)
        } catch (error) {
            logger.error(`Failed to send AWACS log: ${(error as Error).message}`)
            this.emit('error', error as Error)
        }
    }

    // Event handlers for different event types
    private async handleMemberJoin(data: MemberJoinData): Promise<void> {
        await this.sendMessage({
            title: 'New Contact',
            type: 'success',
            content: `**${data.memberName}** [${data.memberId}] has joined ${data.guildName}`,
            timestamp: data.joinedAt
        })
    }

    private async handleMemberLeave(data: MemberLeaveData): Promise<void> {
        await this.sendMessage({
            title: 'Contact Lost',
            type: 'warning',
            content: `**${data.memberName}** [${data.memberId}] has left ${data.guildName}`,
            timestamp: data.leftAt
        })
    }

    private async handleMessageDelete(data: MessageDeleteData): Promise<void> {
        const authorInfo = data.authorName ? `by **${data.authorName}**` : `from unknown user`
        const contentPreview = data.content ? `"${data.content.length > 50 ? data.content.substring(0, 47) + '...' : data.content}"` : `(no content)`

        await this.sendMessage({
            title: 'Message Deleted',
            type: 'warning',
            content: `Message ${authorInfo} deleted in <#${data.channelId}>: ${contentPreview}`,
            timestamp: data.deletedAt
        })
    }

    private async handleMessageEdit(data: MessageEditData): Promise<void> {
        await this.sendMessage({
            title: 'Message Edited',
            type: 'info',
            content: `**${data.authorName}** edited message in <#${data.channelId}>`,
            timestamp: data.editedAt
        })
    }

    private async handleChannelCreate(data: ChannelData): Promise<void> {
        await this.sendMessage({
            title: 'Channel Created',
            type: 'success',
            content: `Channel <#${data.channelId}> (**${data.channelName}**) has been created`,
            timestamp: data.timestamp
        })
    }

    private async handleChannelDelete(data: ChannelData): Promise<void> {
        await this.sendMessage({
            title: 'Channel Deleted',
            type: 'warning',
            content: `Channel **${data.channelName}** [${data.channelId}] has been deleted`,
            timestamp: data.timestamp
        })
    }

    private async handleRoleCreate(data: RoleData): Promise<void> {
        await this.sendMessage({
            title: 'Role Created',
            type: 'success',
            content: `Role **${data.roleName}** has been created`,
            timestamp: data.timestamp
        })
    }

    private async handleRoleDelete(data: RoleData): Promise<void> {
        await this.sendMessage({
            title: 'Role Deleted',
            type: 'warning',
            content: `Role **${data.roleName}** has been deleted`,
            timestamp: data.timestamp
        })
    }

    private async handleMemberBan(data: MemberActionData): Promise<void> {
        const modInfo = data.moderatorName ? ` by **${data.moderatorName}**` : ''
        const reasonInfo = data.reason ? `: "${data.reason}"` : ''

        await this.sendMessage({
            title: 'Target Eliminated',
            type: 'danger',
            content: `**${data.memberName}** [${data.memberId}] has been banned${modInfo}${reasonInfo}`,
            timestamp: data.timestamp
        })
    }

    private async handleMemberUnban(data: MemberActionData): Promise<void> {
        const modInfo = data.moderatorName ? ` by **${data.moderatorName}**` : ''

        await this.sendMessage({
            title: 'Pardon Issued',
            type: 'success',
            content: `**${data.memberName}** [${data.memberId}] has been unbanned${modInfo}`,
            timestamp: data.timestamp
        })
    }

    private async handleMemberTimeout(data: MemberTimeoutData): Promise<void> {
        const durationInMinutes = Math.floor(data.duration / 1000 / 60)
        const modInfo = data.moderatorName ? ` by **${data.moderatorName}**` : ''
        const reasonInfo = data.reason ? `: "${data.reason}"` : ''

        await this.sendMessage({
            title: 'Pilot Grounded',
            type: 'warning',
            content: `**${data.memberName}** timed out for ${durationInMinutes} min${modInfo}${reasonInfo}`,
            timestamp: data.timestamp
        })
    }

    private async handleCustomEvent(data: CustomEventData): Promise<void> {
        // Determine message type based on color or default to info
        let type: 'success' | 'warning' | 'danger' | 'info' = 'info'

        await this.sendMessage({
            title: data.title,
            type,
            content: data.description,
            timestamp: data.timestamp
        })
    }

    private async handleError(error: Error): Promise<void> {
        logger.error(`AWACSFeed error: ${error.message}`)
    }

    // Utility method to send quick events without needing to construct full event objects
    public async sendQuickEvent(options: {
        title: string
        description: string
        type: 'success' | 'warning' | 'danger' | 'info'
        callsign?: string
        fields?: Array<{name: string, value: string, inline?: boolean}>
    }): Promise<void> {
        // For quick events, just use the description as content
        await this.sendMessage({
            title: options.title,
            type: options.type,
            content: options.description,
            callsign: options.callsign
        })
    }
}
