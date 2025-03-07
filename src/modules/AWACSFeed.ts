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

    // Generic method to send a formatted text message
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
            const callsignPrefix = callsign ? `[${callsign}] ` : ''
            const formattedTimestamp = this.formatArcadeTimestamp(timestamp)
            
            // Format the message with Project Wingman/Ace Combat style
            const message = `\`\`\`
CRIMSON AWACS // MISSION LOG
${prefix} ${callsignPrefix}${title.toUpperCase()}
TIME: ${formattedTimestamp}
------------------------------
${content}
\`\`\``
            
            await this.channel.send(message)
            logger.ok(`Sent AWACS log: ${chalk.yellow(title)}`)
        } catch (error) {
            logger.error(`Failed to send AWACS log: ${(error as Error).message}`)
            this.emit('error', error as Error)
        }
    }

    // Event handlers for different event types
    private async handleMemberJoin(data: MemberJoinData): Promise<void> {
        const content = [
            `PILOT ID: ${data.memberName} [${data.memberId}]`,
            `REGISTRATION: Joining AO ${data.guildName}`,
            `STATUS: New contact detected on radar`,
            `ACTION: Monitoring`
        ].join('\n')

        await this.sendMessage({
            title: 'New Contact Detected',
            type: 'success',
            content,
            timestamp: data.joinedAt
        })
    }

    private async handleMemberLeave(data: MemberLeaveData): Promise<void> {
        const content = [
            `PILOT ID: ${data.memberName} [${data.memberId}]`,
            `REGISTRATION: Left AO ${data.guildName}`,
            `STATUS: Contact lost from radar`,
            `ACTION: Removing from flight roster`
        ].join('\n')

        await this.sendMessage({
            title: 'Contact Lost',
            type: 'warning',
            content,
            timestamp: data.leftAt
        })
    }

    private async handleMessageDelete(data: MessageDeleteData): Promise<void> {
        let contentLines = [
            `CHANNEL: #${data.channelName} [${data.channelId}]`,
        ]

        if (data.authorName) {
            contentLines.push(`SENDER: ${data.authorName} [${data.authorId}]`)
        } else {
            contentLines.push(`SENDER: Unknown`)
        }

        if (data.content) {
            const truncatedContent = data.content.length > 500 
                ? data.content.substring(0, 497) + '...' 
                : data.content
            
            contentLines.push(`MESSAGE: "${truncatedContent}"`)
        }

        contentLines.push(`STATUS: Transmission deleted from record`)
        
        await this.sendMessage({
            title: 'Transmission Intercepted',
            type: 'warning',
            content: contentLines.join('\n'),
            timestamp: data.deletedAt
        })
    }

    private async handleMessageEdit(data: MessageEditData): Promise<void> {
        let contentLines = [
            `CHANNEL: #${data.channelName} [${data.channelId}]`,
            `SENDER: ${data.authorName} [${data.authorId}]`,
        ]

        if (data.oldContent && data.newContent) {
            const oldTruncated = data.oldContent.length > 250
                ? data.oldContent.substring(0, 247) + '...'
                : data.oldContent
                
            const newTruncated = data.newContent.length > 250
                ? data.newContent.substring(0, 247) + '...'
                : data.newContent
                
            contentLines.push(`ORIGINAL: "${oldTruncated}"`)
            contentLines.push(`MODIFIED: "${newTruncated}"`)
        } else {
            contentLines.push(`MESSAGE: Content modified`)
        }
        
        await this.sendMessage({
            title: 'Transmission Modified',
            type: 'info',
            content: contentLines.join('\n'),
            timestamp: data.editedAt
        })
    }

    private async handleChannelCreate(data: ChannelData): Promise<void> {
        const content = [
            `CHANNEL ID: #${data.channelName} [${data.channelId}]`,
            `SERVER: ${data.guildName}`,
            `STATUS: New communication line established`,
            `ACTION: Monitoring for transmissions`
        ].join('\n')

        await this.sendMessage({
            title: 'New Communications Channel Established',
            type: 'success',
            content,
            timestamp: data.timestamp
        })
    }

    private async handleChannelDelete(data: ChannelData): Promise<void> {
        const content = [
            `CHANNEL ID: #${data.channelName} [${data.channelId}]`,
            `SERVER: ${data.guildName}`,
            `STATUS: Communication line terminated`,
            `ACTION: Removing from monitoring grid`
        ].join('\n')

        await this.sendMessage({
            title: 'Communications Channel Lost',
            type: 'warning',
            content,
            timestamp: data.timestamp
        })
    }

    private async handleRoleCreate(data: RoleData): Promise<void> {
        const content = [
            `ROLE ID: ${data.roleName} [${data.roleId}]`,
            `SERVER: ${data.guildName}`,
            `COLOR: ${data.roleColor || 'None'}`,
            `STATUS: New command rank established`,
            `ACTION: Adding to command structure`
        ].join('\n')

        await this.sendMessage({
            title: 'New Command Rank Established',
            type: 'success',
            content,
            timestamp: data.timestamp
        })
    }

    private async handleRoleDelete(data: RoleData): Promise<void> {
        const content = [
            `ROLE ID: ${data.roleName} [${data.roleId}]`,
            `SERVER: ${data.guildName}`,
            `STATUS: Command rank decommissioned`,
            `ACTION: Removing from command structure`
        ].join('\n')

        await this.sendMessage({
            title: 'Command Rank Decommissioned',
            type: 'warning',
            content,
            timestamp: data.timestamp
        })
    }

    private async handleMemberBan(data: MemberActionData): Promise<void> {
        let contentLines = [
            `TARGET: ${data.memberName} [${data.memberId}]`,
            `SERVER: ${data.guildName}`
        ]

        if (data.moderatorName) {
            contentLines.push(`OPERATOR: ${data.moderatorName} [${data.moderatorId}]`)
        }

        if (data.reason) {
            contentLines.push(`REASON: ${data.reason}`)
        }

        contentLines.push(`STATUS: Target eliminated`, `ACTION: Permanent removal from AO`)

        await this.sendMessage({
            title: 'Target Eliminated',
            type: 'danger',
            content: contentLines.join('\n'),
            timestamp: data.timestamp
        })
    }

    private async handleMemberUnban(data: MemberActionData): Promise<void> {
        let contentLines = [
            `PILOT: ${data.memberName} [${data.memberId}]`,
            `SERVER: ${data.guildName}`
        ]

        if (data.moderatorName) {
            contentLines.push(`AUTHORIZED BY: ${data.moderatorName} [${data.moderatorId}]`)
        }

        contentLines.push(`STATUS: Pardon issued`, `ACTION: Clearance to return to AO granted`)

        await this.sendMessage({
            title: 'Pardon Issued',
            type: 'success',
            content: contentLines.join('\n'),
            timestamp: data.timestamp
        })
    }

    private async handleMemberTimeout(data: MemberTimeoutData): Promise<void> {
        const durationInMinutes = Math.floor(data.duration / 1000 / 60)
        
        let contentLines = [
            `PILOT: ${data.memberName} [${data.memberId}]`,
            `SERVER: ${data.guildName}`,
            `DURATION: ${durationInMinutes} minutes`
        ]

        if (data.moderatorName) {
            contentLines.push(`GROUNDED BY: ${data.moderatorName} [${data.moderatorId}]`)
        }

        if (data.reason) {
            contentLines.push(`REASON: ${data.reason}`)
        }

        contentLines.push(`STATUS: Temporarily suspended`, `ACTION: Communication privileges revoked`)

        await this.sendMessage({
            title: 'Pilot Grounded',
            type: 'warning',
            content: contentLines.join('\n'),
            timestamp: data.timestamp
        })
    }

    private async handleCustomEvent(data: CustomEventData): Promise<void> {
        // For custom events, build the content from fields
        let contentLines: string[] = [data.description]
        
        if (data.fields && data.fields.length > 0) {
            contentLines.push('')  // Add a blank line for separation
            for (const field of data.fields) {
                contentLines.push(`${field.name.toUpperCase()}: ${field.value}`)
            }
        }
        
        // Determine appropriate type from color if possible
        let type: 'success' | 'warning' | 'danger' | 'info' = 'info'
        
        await this.sendMessage({
            title: data.title,
            type,
            content: contentLines.join('\n'),
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
        fields?: Array<{name: string, value: string, inline?: boolean}>
    }): Promise<void> {
        let contentLines = [options.description]
        
        if (options.fields && options.fields.length > 0) {
            contentLines.push('')  // Add a blank line for separation
            for (const field of options.fields) {
                contentLines.push(`${field.name.toUpperCase()}: ${field.value}`)
            }
        }
        
        await this.sendMessage({
            title: options.title,
            type: options.type,
            content: contentLines.join('\n')
        })
    }
}
