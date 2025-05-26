import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel,
    Client, User, type ImageSize, type ImageExtension,
    TextChannel,
} from 'discord.js'
import { EMBERGLAZE_ID, PING_EMBERGLAZE } from '../util/constants'

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
import type { CommandContext } from '../modules/CommandManager'
import type { ChatCompletionContentPart } from 'openai/resources/index.mjs'

/**
 * Guild ID Resolvable
 * @param {string | Guild | BaseInteraction | GuildChannel | Message} id - The ID for the guild
 */
export type GuildIdResolvable = string | Guild | BaseInteraction | GuildChannel | Message

/**
 * User ID Resolvable
 * @param {GuildMember | User | string | Message} id - The ID for the user
 */
export type UserIdResolvable = GuildMember | User | string | Message

/**
 * Channel ID Resolvable
 * @param {GuildChannel | Message | CommandInteraction | ChatInputCommandInteraction | string | APIInteractionDataResolvedChannel} id - The ID for the channel
 */
export type ChannelIdResolvable = GuildChannel | Message | CommandInteraction |
    ChatInputCommandInteraction | string | APIInteractionDataResolvedChannel

/**
 * At least one, duh
 */
export type AtleastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U]

/**
 * Discord Event Listener
 * @param {Client} client - The client for the event listener
 */
export interface DiscordEventListener {
    default: (client: Client) => void
}

/**
 * Hex Color
 * @param {string} color - The color for the hex color
 */
export type HexColor = `#${string}`

export type Emoji = string
export interface Emojis {
    billy: Emoji[]
}

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
    commits: GitHubCommit[]
}

export type WebhookEvents = {
    push: (payload: GitHubPushEvent) => void
} & {
    [key: string]: (...args: unknown[]) => void
}


export interface MessageTriggerEntry {
    pattern: Array<RegExp | string | ((message: Message) => boolean)>
    action: (message: Message) => Promise<void>
}

export type JSONResolvable = string | number | boolean | {[key: string]: JSONResolvable} | {[key: string]: JSONResolvable}[] | null

/**
 * the "i know what im doing" `any` type, bypasses eslint
 * */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExplicitAny = any

export type OldSlashCommandHelpers = {
    reply: ChatInputCommandInteraction['reply']
    deferReply: ChatInputCommandInteraction['deferReply']
    editReply: ChatInputCommandInteraction['editReply']
    followUp: ChatInputCommandInteraction['followUp']
    client: ChatInputCommandInteraction['client']
    guild: ChatInputCommandInteraction['guild']
    myId: typeof EMBERGLAZE_ID
    pingMe: typeof PING_EMBERGLAZE
    getUserAvatar: (user: User, guild: Guild | null, options?: { extension?: ImageExtension, size?: ImageSize, useGlobalAvatar?: boolean }) => string
}

export type SlashCommandProps = {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder // Allow subcommands-only builder
    permissions?: PermissionsBitField[]
    aliases?: string[]
    description?: string
    usage?: string
    execute: (
        context: CommandContext // context will have subcommandName and subcommandGroupName
    ) => Promise<void>
}


export interface ISlashCommand extends SlashCommandProps {}

export abstract class SlashCommand implements ISlashCommand {
    data!: SlashCommandProps['data']
    permissions?: SlashCommandProps['permissions']
    aliases?: SlashCommandProps['aliases']
    description?: SlashCommandProps['description']
    usage?: SlashCommandProps['usage']
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
        helpers: OldSlashCommandHelpers,
        interaction: ContextMenuInteractionType<T>
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

/**
 * Class Not Initialized Error
 */
export class ClassNotInitializedError extends Error {
    constructor() {
        super('Command handler has not been initialized! Call init() first')
    }
}

/**
 * Missing Permissions Error
 * @param {string} message - The message for the error
 * @param {PermissionsString[]} permissions - The permissions for the error
 */
export class MissingPermissionsError extends Error {
    permissions: PermissionsString[]
    constructor(message: string, permissions: PermissionsString[]) {
        super(message)
        this.permissions = permissions
    }
}

/**
 * Response from ShapesInc sendMessage()
 */
export interface ShapesIncSendMessageResponse {
    id: string
    text: string
    voice_reply_url: string | null
    timestamp: number
}

/**
 * Response from ShapesInc clearChat()
 */
export interface ShapesIncClearChatResponse {
    user_id: string
    shape_id: string
    ts: number
}

/**
 * Single message entry in getChatHistory() response
 */
export interface ShapesIncChatHistoryEntry {
    id: string
    reply: string | null
    message: string | null
    ts: number
    voice_reply_url: string | null
    attachment_url: string | null
    attachment_type: string | null
}

/**
 * Response from ShapesInc getChatHistory()
 * @param {number} Length - Expected length of the array
 */
export type ShapesIncGetChatHistoryResponse<Length extends number = 20> = FixedLengthArray<ShapesIncChatHistoryEntry, Length>

/**
 * API definition for a shapes.inc shape
 */
export interface ShapesIncShape {
    id: string
    name: string
    username: string
    search_description: string
    search_tags_v2: string[]
    created_ts: number
    app_info: {
        bot_avatar: string
        bot_banner: string | null
        bot_id: string
    }
    server_count: unknown // null
    user_count: unknown // null
    message_count: unknown // null
    custom_html: unknown // null
    custom_css: string | null
    custom_html_enabled: boolean
    public_tag: unknown // null
    discord_bot_token_exist: boolean
    x_id_exist: boolean
    x_id: string | null
    x_profile_pic: string | null
    error_message: string | null
    wack_message: string | null
    enabled: boolean
    communities: unknown[]
    tagline: string | null
    typical_phrases: (string | null)[]
    screenshots: ({ id: number, url: string, caption: string } | null)[]
    category: string | null
    custom_category: string | null
    source_material: unknown[]
    character_universe: string
    character_background: string
    discord_invite: string
    example_prompts: (string | null)[]
    shape_settings: {
        shape_initial_message: string
        status_type: string
        status_label: string | null
        status: string
        status_emoji: string | null
        appearance: string
    }
    avatar_url: string
    allow_user_engine_override: boolean
    premium_allow_user_engine_override: boolean | null
    avatar: unknown // null
    banner: unknown // null
}

/**
 * Fixed Length Array
 * @param {T} T - The type of the array
 * @param {N} N - The length of the array
 */
export type FixedLengthArray<T, N extends number, R extends T[] = []> =
  R['length'] extends N ? R : FixedLengthArray<T, N, [T, ...R]>

export type GuildId = string & {} // `& {}` because otherwise intellisense will show `string` instead of `GuildId`

export enum BotInstallationType {
    GuildInstall = 'GUILD_INSTALL',
    UserInstallDM = 'USER_INSTALL_DM',
    UserInstallGuild = 'USER_INSTALL_GUILD',
    Unknown = 'UNKNOWN'
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
    footer?: string
    author?: string
}

export type ChatResponse = string | { embed: DiscordEmbed } | { command: { name: string, params: string[] } }
export type ChatResponseArray = ChatResponse[]
