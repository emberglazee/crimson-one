import { EventEmitter } from 'tseep'
import type {
    Client,
    User as DiscordUser,
    TextChannel,
    Guild as DiscordGuild,
    GuildMember,
    Message as DiscordMessage,
    Attachment,
    Channel as DiscordChannel,
    TextBasedChannel,
    PartialGroupDMChannel,
    PermissionResolvable
} from 'discord.js'
import { ChannelType, EmbedBuilder } from 'discord.js'
import type { IPlatformAttachment, IPlatformChannel, IPlatformClient, IPlatformEmbed, IPlatformEventMap, IPlatformMessage, IPlatformMessageOptions, IPlatformServer, IPlatformServerMember, IPlatformUser } from '../interfaces'

type SendableChannel = Exclude<TextBasedChannel, PartialGroupDMChannel>

export class DiscordUserAdapter implements IPlatformUser {
    constructor(private user: DiscordUser) {}

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
        return this.user.displayAvatarURL()
    }
    get bot(): boolean {
        return this.user.bot
    }
    toString(): string {
        return this.user.toString()
    }
}

export class DiscordAttachmentAdapter implements IPlatformAttachment {
    constructor(private attachment: Attachment) {}

    get id(): string {
        return this.attachment.id
    }
    get url(): string {
        return this.attachment.url
    }
    get name(): string {
        return this.attachment.name ?? 'unknown'
    }
    get contentType(): string | undefined {
        return this.attachment.contentType ?? undefined
    }
    get size(): number {
        return this.attachment.size
    }
}

export class DiscordEmbedAdapter implements IPlatformEmbed {
    constructor(private embed: EmbedBuilder) {}

    get title(): string | undefined {
        const data = this.embed.data
        return data.title ?? undefined
    }
    get description(): string | undefined {
        const data = this.embed.data
        return data.description ?? undefined
    }
    get url(): string | undefined {
        const data = this.embed.data
        return data.url ?? undefined
    }
    get color(): number | undefined {
        const data = this.embed.data
        return data.color ?? undefined
    }
    get timestamp(): Date | undefined {
        const data = this.embed.data
        return data.timestamp ? new Date(data.timestamp) : undefined
    }
    get footer(): { text: string, iconURL?: string } | undefined {
        const data = this.embed.data
        return data.footer
            ? {
                  text: data.footer.text,
                  iconURL: data.footer.icon_url ?? undefined
              }
            : undefined
    }
    get image(): { url: string } | undefined {
        const data = this.embed.data
        return data.image ? { url: data.image.url } : undefined
    }
    get thumbnail(): { url: string } | undefined {
        const data = this.embed.data
        return data.thumbnail ? { url: data.thumbnail.url } : undefined
    }
    get author(): { name: string, url?: string, iconURL?: string } | undefined {
        const data = this.embed.data
        return data.author
            ? {
                  name: data.author.name,
                  url: data.author.url ?? undefined,
                  iconURL: data.author.icon_url ?? undefined
              }
            : undefined
    }
    get fields():
        | Array<{ name: string, value: string, inline?: boolean }>
        | undefined {
        const data = this.embed.data
        return data.fields && data.fields.length > 0
            ? data.fields.map(
                  (f: { name: string, value: string, inline?: boolean }) => ({
                      name: f.name,
                      value: f.value,
                      inline: f.inline
                  })
              )
            : undefined
    }
}

export class DiscordServerMemberAdapter implements IPlatformServerMember {
    constructor(private member: GuildMember) {}

    get id(): string {
        return this.member.id
    }
    get user(): IPlatformUser {
        return new DiscordUserAdapter(this.member.user)
    }
    get displayName(): string {
        return this.member.displayName
    }
    get joinedAt(): Date | undefined {
        return this.member.joinedAt ?? undefined
    }
    get roles(): string[] {
        return this.member.roles.cache.map(r => r.id)
    }

    havePermission(permission: string): boolean {
        try {
            return this.member.permissions.has(permission as PermissionResolvable)
        } catch {
            return false
        }
    }
}

export class DiscordServerAdapter implements IPlatformServer {
    constructor(private guild: DiscordGuild) {}

    get id(): string {
        return this.guild.id
    }
    get name(): string {
        return this.guild.name
    }
    get iconURL(): string | undefined {
        return this.guild.iconURL() ?? undefined
    }
    get ownerId(): string {
        return this.guild.ownerId
    }
    get channels(): IPlatformChannel[] {
        return this.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .map(c => new DiscordChannelAdapter(c as TextChannel))
    }

    getMember(userId: string): IPlatformServerMember | undefined {
        const member = this.guild.members.cache.get(userId)
        return member ? new DiscordServerMemberAdapter(member) : undefined
    }

    async fetchMember(userId: string): Promise<IPlatformServerMember | null> {
        try {
            const member = await this.guild.members.fetch(userId)
            return new DiscordServerMemberAdapter(member)
        } catch {
            return null
        }
    }

    async fetchMembers(): Promise<IPlatformServerMember[]> {
        const members = await this.guild.members.fetch()
        return members.map(m => new DiscordServerMemberAdapter(m))
    }

    havePermission(permission: string): boolean {
        const botMember = this.guild.members.me
        if (!botMember) return false
        try {
            return botMember.permissions.has(permission as PermissionResolvable)
        } catch {
            return false
        }
    }

    async banUser(userId: string, reason?: string): Promise<void> {
        await this.guild.members.ban(userId, { reason })
    }

    async kickUser(userId: string, reason?: string): Promise<void> {
        const member = await this.guild.members.fetch(userId)
        await member.kick(reason)
    }
}

export class DiscordChannelAdapter implements IPlatformChannel {
    constructor(private channel: DiscordChannel) {}

    get id(): string {
        return this.channel.id
    }
    get name(): string {
        if ('name' in this.channel && typeof this.channel.name === 'string') {
            return this.channel.name
        }
        return this.channel.id
    }
    get type(): 'text' | 'dm' | 'group' | 'voice' | 'category' | 'unknown' {
        switch (this.channel.type) {
            case ChannelType.GuildText:
            case ChannelType.PublicThread:
            case ChannelType.PrivateThread:
            case ChannelType.AnnouncementThread:
            case ChannelType.GuildAnnouncement:
                return 'text'
            case ChannelType.DM:
                return 'dm'
            case ChannelType.GroupDM:
                return 'group'
            case ChannelType.GuildVoice:
            case ChannelType.GuildStageVoice:
                return 'voice'
            case ChannelType.GuildCategory:
                return 'category'
            default:
                return 'unknown'
        }
    }
    get serverId(): string | undefined {
        if ('guildId' in this.channel && typeof this.channel.guildId === 'string') {
            return this.channel.guildId
        }
        return undefined
    }

    async sendMessage(
        content: string | IPlatformMessageOptions
    ): Promise<IPlatformMessage> {
        if (!('send' in this.channel) || typeof (this.channel as SendableChannel).send !== 'function') {
            throw new Error(`Cannot send messages to channel type ${this.channel.type}`)
        }
        const textChannel = this.channel as SendableChannel

        if (typeof content === 'string') {
            const message = await textChannel.send(content)
            return new DiscordMessageAdapter(message)
        }

        const options: {
            content?: string
            embeds?: EmbedBuilder[]
            reply?: { messageReference: string }
            allowedMentions?: object
        } = {}

        if (content.content) options.content = content.content
        if (content.embeds) {
            // Convert platform embeds to Discord EmbedBuilder
            options.embeds = content.embeds.map(e => {
                const embed = new EmbedBuilder()
                if (e.title) embed.setTitle(e.title)
                if (e.description) embed.setDescription(e.description)
                if (e.url) embed.setURL(e.url)
                if (e.color) embed.setColor(e.color)
                if (e.timestamp) embed.setTimestamp(e.timestamp)
                if (e.footer)
                    embed.setFooter({
                        text: e.footer.text,
                        iconURL: e.footer.iconURL
                    })
                if (e.image) embed.setImage(e.image.url)
                if (e.thumbnail) embed.setThumbnail(e.thumbnail.url)
                if (e.author)
                    embed.setAuthor({
                        name: e.author.name,
                        url: e.author.url,
                        iconURL: e.author.iconURL
                    })
                if (e.fields) embed.addFields(e.fields)
                return embed
            })
        }
        if (content.replyTo) {
            options.reply = { messageReference: content.replyTo.id }
        }
        if (content.allowedMentions) {
            options.allowedMentions = {
                users: content.allowedMentions.users,
                roles: content.allowedMentions.roles,
                parse: content.allowedMentions.everyone ? ['everyone'] : [],
                repliedUser: content.allowedMentions.repliedUser
            }
        }

        const message = await textChannel.send(options)
        return new DiscordMessageAdapter(message)
    }

    async fetchMessage(messageId: string): Promise<IPlatformMessage | null> {
        if (!('messages' in this.channel)) {
            return null
        }
        try {
            const message = await (this.channel as SendableChannel).messages.fetch(messageId)
            return new DiscordMessageAdapter(message)
        } catch {
            return null
        }
    }

    async fetchMessages(options?: {
        limit?: number
        before?: string
        after?: string
    }): Promise<IPlatformMessage[]> {
        if (!('messages' in this.channel)) {
            return []
        }
        const messages = await (this.channel as SendableChannel).messages.fetch({
            limit: options?.limit,
            before: options?.before,
            after: options?.after
        })
        return messages.map(m => new DiscordMessageAdapter(m))
    }
}

export class DiscordMessageAdapter implements IPlatformMessage {
    constructor(private message: DiscordMessage) {}

    get raw(): DiscordMessage {
        return this.message
    }

    get id(): string {
        return this.message.id
    }
    get content(): string {
        return this.message.content
    }
    get author(): IPlatformUser {
        return new DiscordUserAdapter(this.message.author)
    }
    get channel(): IPlatformChannel {
        if (
            this.message.channel.type === ChannelType.GuildText ||
            this.message.channel.type === ChannelType.DM ||
            this.message.channel.type === ChannelType.GroupDM ||
            this.message.channel.type === ChannelType.PublicThread ||
            this.message.channel.type === ChannelType.PrivateThread ||
            this.message.channel.type === ChannelType.AnnouncementThread ||
            this.message.channel.type === ChannelType.GuildAnnouncement ||
            this.message.channel.type === ChannelType.GuildVoice ||
            this.message.channel.type === ChannelType.GuildStageVoice
        ) {
            return new DiscordChannelAdapter(
                this.message.channel as TextChannel
            )
        }
        throw new Error(`Channel type not supported: ${this.message.channel.type}`)
    }
    get server(): IPlatformServer | undefined {
        if (!this.message.guild) return undefined
        return new DiscordServerAdapter(this.message.guild)
    }
    get member(): IPlatformServerMember | undefined {
        if (!this.message.member) return undefined
        return new DiscordServerMemberAdapter(this.message.member)
    }
    get createdAt(): Date {
        return this.message.createdAt
    }
    get editedAt(): Date | undefined {
        return this.message.editedAt ?? undefined
    }
    get attachments(): IPlatformAttachment[] {
        return Array.from(this.message.attachments.values()).map(
            a => new DiscordAttachmentAdapter(a)
        )
    }
    get mentions(): IPlatformUser[] {
        return Array.from(this.message.mentions.users.values()).map(
            u => new DiscordUserAdapter(u)
        )
    }

    async reply(
        message: string | IPlatformMessageOptions
    ): Promise<IPlatformMessage> {
        const options: {
            content?: string
            embeds?: EmbedBuilder[]
            reply?: { messageReference: string }
        } = {
            reply: { messageReference: this.message.id }
        }

        if (typeof message === 'string') {
            options.content = message
        } else {
            options.content = message.content
            if (message.embeds) {
                options.embeds = message.embeds.map(e => {
                    const embed = new EmbedBuilder()
                    if (e.title) embed.setTitle(e.title)
                    if (e.description) embed.setDescription(e.description)
                    if (e.url) embed.setURL(e.url)
                    if (e.color) embed.setColor(e.color)
                    if (e.timestamp) embed.setTimestamp(e.timestamp)
                    if (e.footer)
                        embed.setFooter({
                            text: e.footer.text,
                            iconURL: e.footer.iconURL
                        })
                    if (e.image) embed.setImage(e.image.url)
                    if (e.thumbnail) embed.setThumbnail(e.thumbnail.url)
                    if (e.author)
                        embed.setAuthor({
                            name: e.author.name,
                            url: e.author.url,
                            iconURL: e.author.iconURL
                        })
                    if (e.fields) embed.addFields(e.fields)
                    return embed
                })
            }
        }

        const replyMsg = await this.message.reply(options)
        return new DiscordMessageAdapter(replyMsg)
    }

    async edit(content: string): Promise<IPlatformMessage> {
        const edited = await this.message.edit(content)
        return new DiscordMessageAdapter(edited)
    }

    async delete(): Promise<void> {
        await this.message.delete()
    }

    async react(emoji: string): Promise<void> {
        await this.message.react(emoji)
    }
}

export class DiscordClientAdapter
    extends EventEmitter<IPlatformEventMap>
    implements IPlatformClient
{
    public user: IPlatformUser | null = null
    public isReady = false

    constructor(private client: Client) {
        super()
        this.setupEventForwarding()
    }

    private setupEventForwarding(): void {
        this.client.on('clientReady', () => {
            this.isReady = true
            this.user = this.client.user
                ? new DiscordUserAdapter(this.client.user)
                : null
            this.emit('ready')
        })

        // If client is already ready, emit ready asynchronously to allow listeners to be set up first
        if (this.client.isReady()) {
            setImmediate(() => {
                if (!this.isReady) {
                    this.isReady = true
                    this.user = this.client.user
                        ? new DiscordUserAdapter(this.client.user)
                        : null
                    this.emit('ready')
                }
            })
        }

        this.client.on('messageCreate', message => {
            this.emit('messageCreate', new DiscordMessageAdapter(message))
        })

        this.client.on('messageUpdate', (oldMsg, newMsg) => {
            this.emit(
                'messageUpdate',
                new DiscordMessageAdapter(newMsg),
                oldMsg.partial
                    ? null
                    : new DiscordMessageAdapter(oldMsg as DiscordMessage)
            )
        })

        this.client.on('messageDelete', message => {
            this.emit(
                'messageDelete',
                new DiscordMessageAdapter(message as DiscordMessage)
            )
        })

        this.client.on('guildMemberAdd', member => {
            this.emit(
                'serverMemberJoin',
                new DiscordServerMemberAdapter(member as GuildMember)
            )
        })

        this.client.on('guildMemberRemove', member => {
            this.emit(
                'serverMemberLeave',
                new DiscordServerMemberAdapter(member as GuildMember)
            )
        })

        this.client.on('error', error => {
            this.emit('error', error as Error)
        })
    }

    async connect(): Promise<void> {
        // Discord client is already connected by the time we create this adapter
        // This method exists for interface compatibility
        if (!this.isReady) {
            throw new Error('Discord client is not ready')
        }
    }

    async disconnect(): Promise<void> {
        await this.client.destroy()
        this.isReady = false
    }

    getServer(serverId: string): IPlatformServer | undefined {
        const guild = this.client.guilds.cache.get(serverId)
        return guild ? new DiscordServerAdapter(guild) : undefined
    }

    getChannel(channelId: string): IPlatformChannel | undefined {
        const channel = this.client.channels.cache.get(channelId)
        if (!channel) return undefined

        // Check if it's any supported text-based channel type
        if (
            channel.type === ChannelType.GuildText ||
            channel.type === ChannelType.DM ||
            channel.type === ChannelType.GroupDM ||
            channel.type === ChannelType.PublicThread ||
            channel.type === ChannelType.PrivateThread ||
            channel.type === ChannelType.AnnouncementThread ||
            channel.type === ChannelType.GuildAnnouncement ||
            channel.type === ChannelType.GuildVoice ||
            channel.type === ChannelType.GuildStageVoice
        ) {
            return new DiscordChannelAdapter(channel as TextChannel)
        }
        return undefined
    }

    getUser(userId: string): IPlatformUser | undefined {
        const user = this.client.users.cache.get(userId)
        return user ? new DiscordUserAdapter(user) : undefined
    }
}
