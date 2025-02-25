import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel, Client, User,
    TextChannel
} from 'discord.js'
import type { ChatCompletionContentPart } from 'openai/resources/index.mjs'

export type GuildIdResolvable = string | Guild | BaseInteraction | GuildChannel | Message
export type UserIdResolvable = GuildMember | User | string | Message
export type ChannelIdResolvable = GuildChannel | Message | CommandInteraction |
    ChatInputCommandInteraction | string | APIInteractionDataResolvedChannel
export type AtleastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U]
export interface DiscordEventListener {
    default: (client: Client) => void
}
export type HexColor = `#${string}`
export interface Emojis {
    billy: Emoji[]
}
export type Emoji = { [key: string]: string }

export interface GitHubCommit {
    id: string
    message: string
    timestamp: string
    url: string
}

export interface GitHubRepository {
    full_name: string
    name: string
}

export interface GitHubPushEvent {
    repository: GitHubRepository
    head_commit: GitHubCommit
}

// CrimsonChat types
export interface UserMessageOptions {
    username: string
    displayName: string
    serverDisplayName: string
    respondingTo?: {
        targetUsername: string
        targetText: string
    }
    imageAttachments?: string[]
    contextMessages?: Array<{
        content: string
        username: string
        displayName: string
        serverDisplayName: string
        guildName?: string
        channelName?: string
    }>
    targetChannel?: TextChannel
    guildName?: string
    channelName?: string
}

export interface UserStatus {
    roles: string[]
    presence: {
        name: string
        type: number
        state?: string
        details?: string
        createdAt: string
    }[] | 'offline or no activities'
}

export interface FormattedUserMessage {
    username: string
    displayName: string
    serverDisplayName: string
    currentTime: string
    text: string
    attachments?: string[]
    respondingTo?: {
        targetUsername: string
        targetText: string
    }
    userStatus: UserStatus | 'unknown'
}

// Additional types needed for message processing
export interface ChatMessage {
    role: 'system' | 'assistant' | 'user'
    content?: string | ChatCompletionContentPart[]
}

export interface ProcessedCommand {
    content: string | null
    hadCommands: boolean
}

export interface UserPresenceInfo {
    roles: string[]
    presence: {
        name: string
        type: number
        state?: string
        details?: string
        createdAt: string
    }[] | 'offline or no activities'
}

export interface Memory {
    content: string
    context?: string
    evaluation?: string
    timestamp: number
    importance: 1 | 2 | 3 | 4 | 5
}

export interface DiscordEmbed {
    title?: string
    description?: string
    color: number
    fields?: { name: string; value: string }[]
    command?: {
        name: string
        params?: string
    }
}

export type ChatResponse = string | { embed: DiscordEmbed }
export type ChatResponseArray = ChatResponse[]
