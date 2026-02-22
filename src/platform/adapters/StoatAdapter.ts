import { Logger } from '../../modules/Logger'
const logger = new Logger('StoatAdapter')

import { EventEmitter } from 'tseep'
import type {
    Client as StoatClient,
    User as StoatUser,
    Server as StoatServer,
    ServerMember as StoatServerMember,
    Channel as StoatChannel,
    Message as StoatMessage,
    File as StoatFile
} from 'stoat.js'
import { Permission } from 'stoat.js'

import type {
    IPlatformUser,
    IPlatformChannel,
    IPlatformServer,
    IPlatformServerMember,
    IPlatformMessage,
    IPlatformAttachment,
    IPlatformEmbed,
    IPlatformMessageOptions,
    IPlatformClient,
    IPlatformEventMap
} from '../interfaces'
import type { ExplicitAny } from '../../types'

export class StoatUserAdapter implements IPlatformUser {
    constructor(private user: StoatUser) {}

    get id(): string {
        return this.user.id
    }
    get username(): string {
        return this.user.username
    }
    get displayName(): string {
        return this.user.displayName
    }
    get avatarURL(): string | undefined {
        return this.user.avatarURL
    }
    get bot(): boolean {
        return !!this.user.bot
    }
    toString(): string {
        return `<@${this.user.id}>`
    }
}

export class StoatAttachmentAdapter implements IPlatformAttachment {
    constructor(private file: StoatFile) {}

    get id(): string {
        return this.file.id
    }
    get url(): string {
        return this.file.originalUrl
    }
    get name(): string {
        return this.file.filename ?? 'unknown'
    }
    get contentType(): string | undefined {
        return this.file.contentType
    }
    get size(): number {
        return this.file.size ?? 0
    }
}

export class StoatServerMemberAdapter implements IPlatformServerMember {
    constructor(private member: StoatServerMember) {}

    get id(): string {
        // Stoat uses MemberCompositeKey which is { server: string, user: string }
        return typeof this.member.id === 'string'
            ? this.member.id
            : this.member.id.user
    }
    get user(): IPlatformUser {
        const user = this.member.user
        if (!user) throw new Error('Member user not available')
        return new StoatUserAdapter(user)
    }
    get displayName(): string {
        return this.member.displayName ?? this.user.username
    }
    get joinedAt(): Date | undefined {
        return this.member.joinedAt
    }
    get roles(): string[] {
        return this.member.roles
    }

    havePermission(permission: string): boolean {
        const server = this.member.server
        if (!server) return false
        // Map permission string to Stoat Permission enum
        const stoatPerm = this.mapPermission(permission)
        if (!stoatPerm) return false
        return this.member.hasPermission(
            server,
            stoatPerm as keyof typeof Permission
        )
    }

    private mapPermission(perm: string): string | null {
        const mapping: Record<string, string> = {
            Administrator: 'ManageServer',
            ManageChannels: 'ManageChannel',
            ManageGuild: 'ManageServer',
            KickMembers: 'KickMembers',
            BanMembers: 'BanMembers',
            ManageMessages: 'ManageMessages',
            SendMessages: 'SendMessage',
            ViewChannel: 'ViewChannel',
            AttachFiles: 'UploadFiles',
            EmbedLinks: 'SendEmbeds'
        }
        return mapping[perm] || perm
    }
}

export class StoatServerAdapter implements IPlatformServer {
    constructor(private server: StoatServer) {}

    get id(): string {
        return this.server.id
    }
    get name(): string {
        return this.server.name
    }
    get iconURL(): string | undefined {
        return this.server.iconURL
    }
    get ownerId(): string {
        return this.server.ownerId
    }
    get channels(): IPlatformChannel[] {
        return this.server.channels.map(c => new StoatChannelAdapter(c))
    }

    getMember(userId: string): IPlatformServerMember | undefined {
        const member = this.server.getMember(userId)
        return member ? new StoatServerMemberAdapter(member) : undefined
    }

    async fetchMember(userId: string): Promise<IPlatformServerMember | null> {
        try {
            const member = await this.server.fetchMember(userId)
            return new StoatServerMemberAdapter(member)
        } catch {
            return null
        }
    }

    async fetchMembers(): Promise<IPlatformServerMember[]> {
        const result = await this.server.fetchMembers()
        return result.members.map(m => new StoatServerMemberAdapter(m))
    }

    havePermission(permission: string): boolean {
        return this.server.havePermission(
            this.mapPermission(permission) as keyof typeof Permission
        )
    }

    async banUser(userId: string, reason?: string): Promise<void> {
        const member = this.server.getMember(userId)
        if (!member) throw new Error('Member not found')
        await member.ban({ reason })
    }

    async kickUser(userId: string, _reason?: string): Promise<void> {
        const member = this.server.getMember(userId)
        if (!member) throw new Error('Member not found')
        await member.kick()
    }

    private mapPermission(perm: string): string {
        const mapping: Record<string, string> = {
            Administrator: 'ManageServer',
            ManageChannels: 'ManageChannel',
            ManageGuild: 'ManageServer',
            KickMembers: 'KickMembers',
            BanMembers: 'BanMembers',
            ManageMessages: 'ManageMessages',
            SendMessages: 'SendMessage',
            ViewChannel: 'ViewChannel',
            AttachFiles: 'UploadFiles',
            EmbedLinks: 'SendEmbeds'
        }
        return mapping[perm] || perm
    }
}

export class StoatChannelAdapter implements IPlatformChannel {
    constructor(private channel: StoatChannel) {}

    get id(): string {
        return this.channel.id
    }
    get name(): string {
        return this.channel.name
    }
    get type(): 'text' | 'dm' | 'group' | 'voice' | 'category' | 'unknown' {
        const type = this.channel.type
        if (type === 'TextChannel') return 'text'
        if (type === 'DirectMessage') return 'dm'
        if (type === 'Group') return 'group'
        // Note: Stoat doesn't have voice channels in the same way Discord does
        // Voice is handled differently in Stoat
        return 'unknown'
    }
    get serverId(): string | undefined {
        return this.channel.serverId
    }

    async sendMessage(
        content: string | IPlatformMessageOptions
    ): Promise<IPlatformMessage> {
        logger.info(
            `[StoatAdapter] Sending message to channel ID: ${this.channel.id}`
        )

        if (typeof content === 'string') {
            const message = await this.channel.sendMessage(content)
            logger.info(
                `[StoatAdapter] Sent text message: ${message.id} (Content: "${content}")`
            )
            return new StoatMessageAdapter(message)
        }

        // Stoat uses DataMessageSend format
        const stoatData: {
            content?: string
            embeds?: object[]
            replies?: { id: string, mention: boolean }[]
        } = {}

        if (content.content) stoatData.content = content.content
        if (content.embeds) {
            stoatData.embeds = content.embeds.map(e =>
                this.convertEmbedToStoat(e)
            )
        }

        if (content.replyTo) {
            stoatData.replies = [{ id: content.replyTo.id, mention: false }]
        } else {
            delete stoatData.replies
        }

        logger.info(
            `[StoatAdapter] Sending complex message payload: ${JSON.stringify(stoatData)}`
        )

        const message = await this.channel.sendMessage(stoatData)
        logger.info(`[StoatAdapter] Sent complex message: ${message.id}`)
        return new StoatMessageAdapter(message)
    }

    async fetchMessage(messageId: string): Promise<IPlatformMessage | null> {
        try {
            const message = await this.channel.fetchMessage(messageId)
            return new StoatMessageAdapter(message)
        } catch {
            return null
        }
    }

    async fetchMessages(options?: {
        limit?: number
        before?: string
        after?: string
    }): Promise<IPlatformMessage[]> {
        const messages = await this.channel.fetchMessages({
            limit: options?.limit,
            before: options?.before,
            after: options?.after
        })
        return messages.map(m => new StoatMessageAdapter(m))
    }

    private convertEmbedToStoat(embed: IPlatformEmbed): object {
        // Stoat embed format is similar but may have slight differences
        return {
            title: embed.title,
            description: embed.description,
            url: embed.url,
            colour: embed.color
                ? `#${embed.color.toString(16).padStart(6, '0')}`
                : undefined,
            timestamp: embed.timestamp?.toISOString(),
            footer: embed.footer
                ? { text: embed.footer.text, icon_url: embed.footer.iconURL }
                : undefined,
            image: embed.image ? { url: embed.image.url } : undefined,
            thumbnail: embed.thumbnail
                ? { url: embed.thumbnail.url }
                : undefined,
            author: embed.author
                ? {
                      name: embed.author.name,
                      url: embed.author.url,
                      icon_url: embed.author.iconURL
                  }
                : undefined,
            fields: embed.fields
        }
    }
}

export class StoatMessageAdapter implements IPlatformMessage {
    constructor(private message: StoatMessage) {}

    get raw(): StoatMessage {
        return this.message
    }

    get id(): string {
        return this.message.id
    }
    get content(): string {
        return this.message.content
    }
    get author(): IPlatformUser {
        return new StoatUserAdapter(this.message.author!)
    }
    get channel(): IPlatformChannel {
        return new StoatChannelAdapter(this.message.channel!)
    }
    get server(): IPlatformServer | undefined {
        const server = this.message.server
        return server ? new StoatServerAdapter(server) : undefined
    }
    get member(): IPlatformServerMember | undefined {
        const member = this.message.member
        return member ? new StoatServerMemberAdapter(member) : undefined
    }
    get createdAt(): Date {
        return this.message.createdAt
    }
    get editedAt(): Date | undefined {
        return this.message.editedAt ?? undefined
    }
    get attachments(): IPlatformAttachment[] {
        return (
            this.message.attachments?.map(
                a => new StoatAttachmentAdapter(a)
            ) ?? []
        )
    }
    get mentions(): IPlatformUser[] {
        // Stoat mentions are stored differently, need to extract from message
        // For now return empty array - mentions would need to be parsed from content
        return []
    }

    async reply(
        message: string | IPlatformMessageOptions
    ): Promise<IPlatformMessage> {
        const options =
            typeof message === 'string' ? { content: message } : message
        return this.channel.sendMessage({
            ...options,
            replyTo: this
        })
    }

    async edit(content: string): Promise<IPlatformMessage> {
        await this.message.edit({ content })
        // Stoat's reactive system updates the underlying data
        // Return this adapter since the message data is now updated
        return this
    }

    async delete(): Promise<void> {
        await this.message.delete()
    }

    async react(emoji: string): Promise<void> {
        await this.message.react(emoji)
    }
}

export type StoatConnectionMode = 'websocket' | 'polling' | 'hybrid'

export class StoatClientAdapter
    extends EventEmitter<IPlatformEventMap>
    implements IPlatformClient
{
    public user: IPlatformUser | null = null
    public isReady = false
    private processedMessageIds = new Set<string>()
    private pollingInterval: NodeJS.Timeout | null = null
    private connectionMode: StoatConnectionMode = 'websocket'

    constructor(private client: StoatClient) {
        super()
        this.setupEventForwarding()
    }

    public setConnectionMode(mode: StoatConnectionMode): void {
        this.connectionMode = mode
        logger.info(`[StoatAdapter] Connection mode set to: ${mode}`)

        if (mode === 'websocket') {
            this.stopPolling()
            // Ensure websocket is connected if not already?
            // client.connect() handles that.
        } else if (mode === 'polling') {
            this.startPolling()
            // We might want to disconnect websocket here, but stoat.js might rely on it for other things?
            // For now, we'll just enable polling.
        } else {
            // hybrid
            this.startPolling()
        }
    }

    private setupEventForwarding(): void {
        // TODO: replace `ExplicitAny`
        const logPacket = (packet: ExplicitAny) => {
            if (
                packet.type === 'Authenticated' ||
                packet.type === 'Ping' ||
                packet.type === 'Pong'
            )
                return
            if (packet.type === 'Bulk') {
                packet.v.forEach(logPacket)
                return
            }
            logger.info(`[StoatAdapter] RAW PACKET: ${JSON.stringify(packet)}`)
        }

        this.client.events.on('event', logPacket)

        this.client.on('ready', async () => {
            this.isReady = true
            this.user = this.client.user
                ? new StoatUserAdapter(this.client.user)
                : null

            // Set bot status to Online so it appears online to users
            try {
                await this.client.api.patch('/users/@me', {
                    status: {
                        presence: 'Online'
                    }
                })
            } catch {
                // Silently ignore
            }

            this.emit('ready')
            logger.info(
                `[StoatAdapter] Connected as: ${this.user?.username} (${this.user?.id})`
            )

            // Start HTTP polling fallback
            this.startPolling()
        })

        // If client is already ready, emit ready asynchronously to allow listeners to be set up first
        if (this.client.user) {
            setImmediate(async () => {
                if (!this.isReady) {
                    this.isReady = true
                    this.user = this.client.user
                        ? new StoatUserAdapter(this.client.user)
                        : null

                    // Set bot status to Online so it appears online to users
                    try {
                        await this.client.api.patch('/users/@me', {
                            status: {
                                presence: 'Online'
                            }
                        })
                    } catch {
                        // Silently ignore
                    }

                    this.emit('ready')
                    this.startPolling()
                }
            })
        }

        this.client.on('messageCreate', message => {
            if (this.connectionMode === 'polling') return

            logger.info(
                `[StoatAdapter] WS Received: ${message.content} (${message.id})`
            )
            this.handleIncomingMessage(message)
        })

        this.client.on('messageUpdate', (message, previousMessage) => {
            if (this.connectionMode === 'polling') return

            this.emit(
                'messageUpdate',
                new StoatMessageAdapter(message),
                previousMessage
                    ? new StoatMessageAdapter(
                          previousMessage as unknown as StoatMessage
                      )
                    : null
            )
        })

        this.client.on('messageDelete', message => {
            if (this.connectionMode === 'polling') return

            this.emit(
                'messageDelete',
                new StoatMessageAdapter(message as unknown as StoatMessage)
            )
        })

        this.client.on('serverMemberJoin', member => {
            if (this.connectionMode === 'polling') return
            this.emit('serverMemberJoin', new StoatServerMemberAdapter(member))
        })

        this.client.on('serverMemberLeave', member => {
            if (this.connectionMode === 'polling') return
            this.emit(
                'serverMemberLeave',
                new StoatServerMemberAdapter(
                    member as unknown as StoatServerMember
                )
            )
        })

        this.client.on('error', error => {
            this.emit('error', error as Error)
        })
    }

    private handleIncomingMessage(message: StoatMessage): void {
        if (this.processedMessageIds.has(message.id)) return

        this.processedMessageIds.add(message.id)
        // Cleanup ID after 60 seconds
        setTimeout(() => this.processedMessageIds.delete(message.id), 60000)

        this.emit('messageCreate', new StoatMessageAdapter(message))
    }

    private startPolling() {
        if (this.connectionMode === 'websocket' && this.isReady) {
            // If in strict websocket mode, do not poll
            return
        }

        if (this.pollingInterval) return
        logger.info('[StoatAdapter] Starting HTTP polling...')
        // Poll every 10 seconds to avoid rate limits but stay relatively responsive
        this.pollingInterval = setInterval(() => this.pollChannels(), 10000)
        this.pollChannels() // Initial poll
    }

    private stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval)
            this.pollingInterval = null
            logger.info('[StoatAdapter] Stopped HTTP polling')
        }
    }

    private async pollChannels() {
        if (!this.client.channels) return

        try {
            // Iterate over all active text channels we can see
            for (const channel of this.client.channels.values()) {
                if (
                    channel.type === 'TextChannel' ||
                    channel.type === 'DirectMessage' ||
                    channel.type === 'Group'
                ) {
                    // Skip if we processed this channel very recently?
                    // For now, simple polling.
                    // Note: fetchMessages fetches latest messages.

                    // We catch errors per channel to avoid stopping the loop
                    channel
                        .fetchMessages({ limit: 3, sort: 'Latest' })
                        .then(messages => {
                            for (const msg of messages) {
                                // Only process messages from others, and newer than some threshold?
                                // Deduplication handles the "new" part effectively.
                                // We also rely on processedMessageIds to avoid re-emitting old messages
                                // if the bot restarts (though active session logic applies).
                                // Actually, on startup, fetching history might emit old commands.
                                // We should probably check timestamp if it's very old?
                                // Let's assume 1 minute window for "live" commands for now.

                                const age = Date.now() - msg.createdAt.getTime()
                                if (age < 60000) {
                                    // Only process messages from last minute
                                    this.handleIncomingMessage(msg)
                                }
                            }
                        })
                        .catch(() => {
                            // Suppress polling errors (permissions, etc)
                        })
                }
            }
        } catch (e) {
            logger.error(`[StoatAdapter] Polling error: ${e}`)
        }
    }

    async connect(): Promise<void> {
        this.client.connect()
        // Wait for ready event
        await new Promise<void>(resolve => {
            const checkReady = () => {
                if (this.isReady) {
                    resolve()
                } else {
                    setTimeout(checkReady, 100)
                }
            }
            checkReady()
        })
    }

    async disconnect(): Promise<void> {
        // Stoat client doesn't have an explicit disconnect method
        // Events stop when the process ends
        this.isReady = false
    }

    getServer(serverId: string): IPlatformServer | undefined {
        const server = this.client.servers.get(serverId)
        return server ? new StoatServerAdapter(server) : undefined
    }

    getChannel(channelId: string): IPlatformChannel | undefined {
        const channel = this.client.channels.get(channelId)
        return channel ? new StoatChannelAdapter(channel) : undefined
    }

    getUser(userId: string): IPlatformUser | undefined {
        const user = this.client.users.get(userId)
        return user ? new StoatUserAdapter(user) : undefined
    }

    wrapMessage(rawMessage: StoatMessage): IPlatformMessage {
        return new StoatMessageAdapter(rawMessage)
    }
}
