import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel,
    Client, User, type ImageSize, type ImageExtension
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
    guild: ChatInputCommandInteraction['guild']
    myId: typeof EMBERGLAZE_ID
    pingMe: typeof PING_EMBERGLAZE
    getUserAvatar: (user: User, guild: Guild | null, options?: { extension?: ImageExtension, size?: ImageSize, useGlobalAvatar?: boolean }) => string
}

export type SlashCommandProps = {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder
    permissions?: PermissionsBitField[]
    execute: (
        helpers: SlashCommandHelpers,
        interaction: ChatInputCommandInteraction
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
        helpers: SlashCommandHelpers,
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
 * @param {PermissionsBitField[] | PermissionsString[]} permissions - The permissions for the error
 */
export class MissingPermissionsError extends Error {
    permissions: PermissionsBitField[] | PermissionsString[]
    constructor(message: string, permissions: PermissionsBitField[] | PermissionsString[]) {
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
 * Fixed Length Array
 * @param {T} T - The type of the array
 * @param {N} N - The length of the array
 */
export type FixedLengthArray<T, N extends number, R extends T[] = []> =
  R['length'] extends N ? R : FixedLengthArray<T, N, [T, ...R]>
