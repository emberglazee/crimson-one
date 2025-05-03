import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel, Client, User,
    TextChannel
} from 'discord.js'

// Command Manager Types
import {
    SlashCommandBuilder,
    PermissionsBitField,
    ContextMenuCommandBuilder,
    type SlashCommandSubcommandsOnlyBuilder,
    type SlashCommandOptionsOnlyBuilder,
    type UserContextMenuCommandInteraction,
    type MessageContextMenuCommandInteraction,
    type PermissionsString
} from 'discord.js'

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

export interface MentionData {
    type: 'mention'
    id: string
    username: string
}

export interface FormattedUserMessage {
    username: string
    displayName: string
    serverDisplayName: string
    currentTime: string
    text: string
    mentions?: MentionData[]
    attachments?: string[]
    respondingTo?: {
        targetUsername: string
        targetText: string
    }
    userStatus: UserStatus | 'unknown'
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
    footer?: string
    author?: string
}

export type ChatResponse = string | { embed: DiscordEmbed } | { command: { name: string, params: string[] } }
export type ChatResponseArray = ChatResponse[]

export interface ScreamOnSightTrigger {
    pattern: Array<RegExp | string | ((message: Message) => boolean)>
    action: (message: Message) => Promise<void>
}

export type JSONResolvable = string | number | boolean | {[key: string]: JSONResolvable} | {[key: string]: JSONResolvable}[] | null

/**
 * the "i know what im doing" `any` type, bypasses eslint
 * */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExplicitAny = any

export type SlashCommandHelpers = {
    reply: ChatInputCommandInteraction['reply']
    deferReply: ChatInputCommandInteraction['deferReply']
    editReply: ChatInputCommandInteraction['editReply']
    followUp: ChatInputCommandInteraction['followUp']
    client: ChatInputCommandInteraction['client']
}

export type SlashCommandProps = {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder
    permissions?: PermissionsBitField[]
    execute: (
        interaction: ChatInputCommandInteraction,
        helpers: SlashCommandHelpers
    ) => Promise<void>
}

export interface ISlashCommand extends SlashCommandProps {}

export abstract class SlashCommand implements ISlashCommand {
    data!: SlashCommandProps['data']
    permissions?: SlashCommandProps['permissions']
    execute!: SlashCommandProps['execute']
}

export interface IGuildSlashCommand extends ISlashCommand {
    guildId: string
}

export abstract class GuildSlashCommand extends SlashCommand implements IGuildSlashCommand {
    guildId!: string
}

export type ContextMenuCommandProps<T extends 2 | 3 = 2 | 3> = {
    data: ContextMenuCommandBuilder
    type: T
    execute: (
        interaction: ContextMenuInteractionType<T>,
        helpers: SlashCommandHelpers
    ) => Promise<void>
    permissions?: SlashCommandProps['permissions']
}

export type ContextMenuInteractionType<T extends 2 | 3> = T extends 2
    ? UserContextMenuCommandInteraction
    : MessageContextMenuCommandInteraction

export interface IContextMenuCommand<T extends 2 | 3 = 2 | 3> extends ContextMenuCommandProps<T> {}

export abstract class ContextMenuCommand<T extends 2 | 3 = 2 | 3> implements IContextMenuCommand<T> {
    data!: ContextMenuCommandProps<T>['data']
    type!: ContextMenuCommandProps<T>['type']
    execute!: ContextMenuCommandProps<T>['execute']
    permissions?: ContextMenuCommandProps['permissions']
}

export class ClassNotInitializedError extends Error {
    constructor() {
        super('Command handler has not been initialized! Call init() first')
    }
}

export class MissingPermissionsError extends Error {
    permissions: PermissionsBitField[] | PermissionsString[]
    constructor(message: string, permissions: PermissionsBitField[] | PermissionsString[]) {
        super(message)
        this.permissions = permissions
    }
}
