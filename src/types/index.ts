import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel,
    Client, User, type ImageSize, type ImageExtension, TextChannel
} from 'discord.js'
import { EMBI_ID as EMBI_ID, PING_EMBI as PING_EMBI } from '../util/constants'

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
import type { CommandContext } from '../modules/CommandManager/CommandContext'

export type GuildIdResolvable = string | Guild | BaseInteraction | GuildChannel | Message
export type UserIdResolvable = GuildMember | User | string | Message
export type ChannelIdResolvable = GuildChannel | Message | CommandInteraction |
    ChatInputCommandInteraction | string | APIInteractionDataResolvedChannel

export type AtleastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U]

export interface DiscordEventListener {
    default: (client: Client, ...args: any[]) => void
}

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

export type GithubWebhookEvents = {
    push: (payload: GitHubPushEvent) => void
} & {
    [key: string]: (...args: unknown[]) => void
}

export interface MessageTriggerEntry {
    pattern: Array<RegExp | string | ((message: Message) => boolean)>
    action: (message: Message) => Promise<void>
}

export type JSONResolvable = string | number | boolean | {[key: string]: JSONResolvable} | {[key: string]: JSONResolvable}[] | null

export type GuildOnlyCommandContext = CommandContext<true>

/**
 * the "i know what im doing" `any` type, bypasses eslint
 * */

export type ExplicitAny = any

export type OldSlashCommandHelpers = {
    reply: ChatInputCommandInteraction['reply']
    deferReply: ChatInputCommandInteraction['deferReply']
    editReply: ChatInputCommandInteraction['editReply']
    followUp: ChatInputCommandInteraction['followUp']
    client: ChatInputCommandInteraction['client']
    guild: ChatInputCommandInteraction['guild']
    embiId: typeof EMBI_ID
    pingEmbi: typeof PING_EMBI
    getUserAvatar: (user: User, guild: Guild | null, options?: { extension?: ImageExtension, size?: ImageSize, useGlobalAvatar?: boolean }) => string
}

export type SlashCommandProps = {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder // Allow subcommands-only builder
    permissions?: PermissionsBitField[]
    aliases?: string[]
    description?: string
    usage?: string
    execute?: (context: CommandContext<boolean>) => Promise<void>
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
    execute: (context: GuildOnlyCommandContext) => Promise<void>
}

export abstract class GuildSlashCommand extends SlashCommand implements IGuildSlashCommand {
    guildId!: string
    declare execute: (context: GuildOnlyCommandContext) => Promise<void>
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

export class ClassNotInitializedError extends Error {
    constructor() {
        super('The command handler has not been initialized. Call init() first')
    }
}

export class MissingPermissionsError extends Error {
    permissions: PermissionsString[]
    constructor(message: string, permissions: PermissionsString[]) {
        super(message)
        this.permissions = permissions
    }
}

export type FixedLengthArray<T, N extends number, R extends T[] = []> =
    R['length'] extends N ? R : FixedLengthArray<T, N, [T, ...R]>

export type GuildId = string & {} // `& {}` because otherwise intellisense will show `string` instead of `GuildId`

export enum BotInstallationType {
    GuildInstall = 'GUILD_INSTALL',
    UserInstallDM = 'USER_INSTALL_DM',
    UserInstallGuild = 'USER_INSTALL_GUILD',
    Unknown = 'UNKNOWN'
}

export interface UserMessageOptions {
    username: string
    displayName: string
    serverDisplayName: string
    messageContent: string
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
    channelId?: string
    messageId?: string
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

export type LogLevel = 'error' | 'warn' | 'info' | 'ok' | 'debug'
export interface LogPayload {
    level: LogLevel
    message: string
    module?: string
}
