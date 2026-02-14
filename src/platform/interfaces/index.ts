import type { Message as DiscordMessage } from 'discord.js'
import type { Message as StoatMessage } from 'stoat.js'

export interface IPlatformUser {
    id: string
    username: string
    displayName: string
    avatarURL?: string
    bot: boolean
    toString(): string
}

export interface IPlatformChannel {
    id: string
    name: string
    type: 'text' | 'dm' | 'group' | 'voice' | 'category' | 'unknown'
    serverId?: string
    sendMessage(
        content: string | IPlatformMessageOptions,
    ): Promise<IPlatformMessage>
    fetchMessage(messageId: string): Promise<IPlatformMessage | null>
    fetchMessages(options?: {
        limit?: number
        before?: string
        after?: string
    }): Promise<IPlatformMessage[]>
}

export interface IPlatformServer {
    id: string
    name: string
    iconURL?: string
    ownerId: string
    channels: IPlatformChannel[]
    getMember(userId: string): IPlatformServerMember | undefined
    fetchMember(userId: string): Promise<IPlatformServerMember | null>
    fetchMembers(): Promise<IPlatformServerMember[]>
    havePermission(permission: string): boolean
    banUser(userId: string, reason?: string, duration?: number): Promise<void>
    kickUser(userId: string, reason?: string): Promise<void>
}

export interface IPlatformServerMember {
    id: string
    user: IPlatformUser
    displayName: string
    joinedAt?: Date
    roles: string[]
    havePermission(permission: string): boolean
}

export interface IPlatformMessage {
    id: string
    content: string
    author: IPlatformUser
    channel: IPlatformChannel
    server?: IPlatformServer
    member?: IPlatformServerMember
    createdAt: Date
    editedAt?: Date
    attachments: IPlatformAttachment[]
    mentions: IPlatformUser[]
    raw: DiscordMessage | StoatMessage
    reply(message: string | IPlatformMessageOptions): Promise<IPlatformMessage>
    edit(content: string): Promise<IPlatformMessage>
    delete(): Promise<void>
    react(emoji: string): Promise<void>
}

export interface IPlatformAttachment {
    id: string
    url: string
    name: string
    contentType?: string
    size: number
}

export interface IPlatformEmbed {
    title?: string
    description?: string
    url?: string
    color?: number
    timestamp?: Date
    footer?: { text: string, iconURL?: string }
    image?: { url: string }
    thumbnail?: { url: string }
    author?: { name: string, url?: string, iconURL?: string }
    fields?: Array<{ name: string, value: string, inline?: boolean }>
}

export interface IPlatformMessageOptions {
    content?: string
    embeds?: IPlatformEmbed[]
    attachments?: IPlatformAttachment[]
    replyTo?: IPlatformMessage
    allowedMentions?: {
        users?: string[]
        roles?: string[]
        everyone?: boolean
        repliedUser?: boolean
    }
}

export type IPlatformEventMap = {
    ready: () => void
    messageCreate: (message: IPlatformMessage) => void
    messageUpdate: (
        message: IPlatformMessage,
        oldMessage: IPlatformMessage | null,
    ) => void
    messageDelete: (message: IPlatformMessage) => void
    serverMemberJoin: (member: IPlatformServerMember) => void
    serverMemberLeave: (member: IPlatformServerMember) => void
    error: (error: Error) => void
} & {
    [event: string]: (...args: unknown[]) => void
}

export interface IPlatformClient {
    user: IPlatformUser | null
    isReady: boolean
    connect(): Promise<void>
    disconnect(): Promise<void>
    getServer(serverId: string): IPlatformServer | undefined
    getChannel(channelId: string): IPlatformChannel | undefined
    getUser(userId: string): IPlatformUser | undefined
    on<K extends keyof IPlatformEventMap>(
        event: K,
        listener: IPlatformEventMap[K],
    ): this
    once<K extends keyof IPlatformEventMap>(
        event: K,
        listener: IPlatformEventMap[K],
    ): this
    emit<K extends keyof IPlatformEventMap>(
        event: K,
        ...args: Parameters<IPlatformEventMap[K]>
    ): boolean
}

export interface IPlatformClient {
    user: IPlatformUser | null
    isReady: boolean
    connect(): Promise<void>
    disconnect(): Promise<void>
    getServer(serverId: string): IPlatformServer | undefined
    getChannel(channelId: string): IPlatformChannel | undefined
    getUser(userId: string): IPlatformUser | undefined
    on<K extends keyof IPlatformEventMap>(
        event: K,
        listener: IPlatformEventMap[K],
    ): this
    once<K extends keyof IPlatformEventMap>(
        event: K,
        listener: IPlatformEventMap[K],
    ): this
    emit<K extends keyof IPlatformEventMap>(
        event: K,
        ...args: Parameters<IPlatformEventMap[K]>
    ): boolean
}
