// module for public audit logs stylized to Project Wingman

import { Client, EmbedBuilder, TextChannel } from 'discord.js'
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

    // Style configuration
    private colorSuccess: ColorResolvable = '#00FF99' // Cascadian green
    private colorWarning: ColorResolvable = '#F96302' // Cordium orange
    private colorDanger: ColorResolvable = '#FF3333'  // Federation red
    private colorInfo: ColorResolvable = '#3498DB'    // Blue info
    private headerEmojis = {
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

    // Configure styling options
    public setStyle(options: {
        colorSuccess?: ColorResolvable,
        colorWarning?: ColorResolvable,
        colorDanger?: ColorResolvable,
        colorInfo?: ColorResolvable,
        callsigns?: Partial<Record<string, string>>
    }): void {
        if (options.colorSuccess) this.colorSuccess = options.colorSuccess
        if (options.colorWarning) this.colorWarning = options.colorWarning
        if (options.colorDanger) this.colorDanger = options.colorDanger
        if (options.colorInfo) this.colorInfo = options.colorInfo
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

    // Generic method to send an embed message
    private async sendEmbed(options: {
        title: string,
        description: string,
        color: ColorResolvable,
        fields?: Array<{name: string, value: string, inline?: boolean}>,
        footer?: string,
        thumbnail?: string,
        image?: string,
        timestamp?: Date,
        callsign?: string
    }): Promise<void> {
        if (!this.initialized || !this.channel) {
            logger.warn('AWACS Feed not initialized or channel not set')
            return
        }

        const { title, description, color, fields, footer, thumbnail, image, timestamp, callsign } = options

        try {
            const callsignPrefix = callsign ? `[${callsign}]: ` : ''
            const embed = new EmbedBuilder()
                .setTitle(`${callsignPrefix}${title}`)
                .setDescription(description)
                .setColor(color)
                .setTimestamp(timestamp || new Date())

            if (footer) {
                embed.setFooter({ text: footer })
            } else {
                embed.setFooter({ text: `MISSION TIMESTAMP: ${this.formatArcadeTimestamp(timestamp || new Date())}` })
            }

            if (fields && fields.length > 0) {
                embed.addFields(fields)
            }

            if (thumbnail) {
                embed.setThumbnail(thumbnail)
            }

            if (image) {
                embed.setImage(image)
            }

            await this.channel.send({ embeds: [embed] })
            logger.ok(`Sent AWACS log: ${chalk.yellow(title)}`)
        } catch (error) {
            logger.error(`Failed to send AWACS log: ${(error as Error).message}`)
            this.emit('error', error as Error)
        }
    }

    // Event handlers for different event types
    private async handleMemberJoin(data: MemberJoinData): Promise<void> {
        await this.sendEmbed({
            title: 'New Contact Detected',
            description: `**${data.memberName}** has arrived in the AO.`,
            color: this.colorSuccess,
            fields: [
                { name: 'Member ID', value: data.memberId, inline: true },
                { name: 'Server', value: data.guildName, inline: true },
                { name: 'Joined', value: `<t:${Math.floor(data.joinedAt.getTime() / 1000)}:R>`, inline: true }
            ],
            timestamp: data.joinedAt
        })
    }

    private async handleMemberLeave(data: MemberLeaveData): Promise<void> {
        await this.sendEmbed({
            title: 'Contact Lost',
            description: `**${data.memberName}** has left the AO.`,
            color: this.colorWarning,
            fields: [
                { name: 'Member ID', value: data.memberId, inline: true },
                { name: 'Server', value: data.guildName, inline: true },
                { name: 'Left', value: `<t:${Math.floor(data.leftAt.getTime() / 1000)}:R>`, inline: true }
            ],
            timestamp: data.leftAt
        })
    }

    private async handleMessageDelete(data: MessageDeleteData): Promise<void> {
        const description = data.authorName 
            ? `Message by **${data.authorName}** deleted in <#${data.channelId}>.` 
            : `Message deleted in <#${data.channelId}>.`

        const fields = []

        if (data.content) {
            fields.push({ 
                name: 'Content', 
                value: data.content.length > 1024 
                    ? data.content.substring(0, 1021) + '...' 
                    : data.content 
            })
        }

        await this.sendEmbed({
            title: 'Transmission Intercepted',
            description,
            color: this.colorWarning,
            fields,
            timestamp: data.deletedAt
        })
    }

    private async handleMessageEdit(data: MessageEditData): Promise<void> {
        const fields = []

        if (data.oldContent) {
            fields.push({ 
                name: 'Before', 
                value: data.oldContent.length > 1024 
                    ? data.oldContent.substring(0, 1021) + '...' 
                    : data.oldContent 
            })
        }

        fields.push({ 
            name: 'After', 
            value: data.newContent.length > 1024 
                ? data.newContent.substring(0, 1021) + '...' 
                : data.newContent 
        })

        await this.sendEmbed({
            title: 'Transmission Modified',
            description: `Message by **${data.authorName}** edited in <#${data.channelId}>.`,
            color: this.colorInfo,
            fields,
            timestamp: data.editedAt
        })
    }

    private async handleChannelCreate(data: ChannelData): Promise<void> {
        await this.sendEmbed({
            title: 'New Communications Channel Established',
            description: `Channel <#${data.channelId}> (**${data.channelName}**) has been created.`,
            color: this.colorSuccess,
            timestamp: data.timestamp
        })
    }

    private async handleChannelDelete(data: ChannelData): Promise<void> {
        await this.sendEmbed({
            title: 'Communications Channel Lost',
            description: `Channel **${data.channelName}** has been deleted.`,
            color: this.colorWarning,
            timestamp: data.timestamp
        })
    }

    private async handleRoleCreate(data: RoleData): Promise<void> {
        await this.sendEmbed({
            title: 'New Command Rank Established',
            description: `Role **${data.roleName}** has been created.`,
            color: (data.roleColor as ColorResolvable) || this.colorSuccess,
            timestamp: data.timestamp
        })
    }

    private async handleRoleDelete(data: RoleData): Promise<void> {
        await this.sendEmbed({
            title: 'Command Rank Decommissioned',
            description: `Role **${data.roleName}** has been deleted.`,
            color: this.colorWarning,
            timestamp: data.timestamp
        })
    }

    private async handleMemberBan(data: MemberActionData): Promise<void> {
        let description = `**${data.memberName}** has been banned.`
        if (data.moderatorName) {
            description = `**${data.memberName}** has been banned by **${data.moderatorName}**.`
        }

        const fields = []
        if (data.reason) {
            fields.push({ name: 'Reason', value: data.reason })
        }

        await this.sendEmbed({
            title: 'Target Eliminated',
            description,
            color: this.colorDanger,
            fields,
            timestamp: data.timestamp
        })
    }

    private async handleMemberUnban(data: MemberActionData): Promise<void> {
        let description = `**${data.memberName}** has been unbanned.`
        if (data.moderatorName) {
            description = `**${data.memberName}** has been unbanned by **${data.moderatorName}**.`
        }

        await this.sendEmbed({
            title: 'Pardon Issued',
            description,
            color: this.colorSuccess,
            timestamp: data.timestamp
        })
    }

    private async handleMemberTimeout(data: MemberTimeoutData): Promise<void> {
        const durationInMinutes = Math.floor(data.duration / 1000 / 60)

        let description = `**${data.memberName}** has been timed out for ${durationInMinutes} minutes.`
        if (data.moderatorName) {
            description = `**${data.memberName}** has been timed out for ${durationInMinutes} minutes by **${data.moderatorName}**.`
        }

        const fields = []
        if (data.reason) {
            fields.push({ name: 'Reason', value: data.reason })
        }

        await this.sendEmbed({
            title: 'Pilot Grounded',
            description,
            color: this.colorWarning,
            fields,
            timestamp: data.timestamp
        })
    }

    private async handleCustomEvent(data: CustomEventData): Promise<void> {
        await this.sendEmbed({
            title: data.title,
            description: data.description,
            color: data.color || this.colorInfo,
            fields: data.fields,
            timestamp: data.timestamp,
            footer: data.footer,
            thumbnail: data.thumbnail,
            image: data.image
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
        const colorMap = {
            'success': this.colorSuccess,
            'warning': this.colorWarning,
            'danger': this.colorDanger,
            'info': this.colorInfo
        }

        await this.sendEmbed({
            title: `${this.headerEmojis[options.type]} ${options.title}`,
            description: options.description,
            color: colorMap[options.type],
            fields: options.fields
        })
    }
}
