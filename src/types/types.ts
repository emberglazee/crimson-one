import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel, Client, User
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
 * At least One
 * @param {T} T - The type for the at least one
 * @param {U} U - The type for the at least one
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

/**
 * Slash Command Helpers, for convenience
 */
export type SlashCommandHelpers = {
    reply: ChatInputCommandInteraction['reply']
    deferReply: ChatInputCommandInteraction['deferReply']
    editReply: ChatInputCommandInteraction['editReply']
    followUp: ChatInputCommandInteraction['followUp']
    client: ChatInputCommandInteraction['client']
    guild: ChatInputCommandInteraction['guild']
    myId: typeof EMBERGLAZE_ID
    pingMe: typeof PING_EMBERGLAZE
}

/**
 * Slash Command Props
 * @param {SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder} data - The data for the slash command
 * @param {PermissionsBitField[]} permissions - The permissions for the slash command
 */
export type SlashCommandProps = {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder
    permissions?: PermissionsBitField[]
    execute: (
        interaction: ChatInputCommandInteraction,
        helpers: SlashCommandHelpers
    ) => Promise<void>
}

/**
 * Slash Command Interface
 * @param {SlashCommandProps} data - The data for the slash command
 * @param {PermissionsBitField[]} permissions - The permissions for the slash command
 */
export interface ISlashCommand extends SlashCommandProps {}

/**
 * Slash Command Class
 * @abstract
 * @param {SlashCommandProps} data - The data for the slash command
 * @param {PermissionsBitField[]} permissions - The permissions for the slash command
 */
export abstract class SlashCommand implements ISlashCommand {
    data!: SlashCommandProps['data']
    permissions?: SlashCommandProps['permissions']
    execute!: SlashCommandProps['execute']
}

/**
 * Guild Slash Command Interface
 * @param {ISlashCommand} data - The data for the slash command
 * @param {PermissionsBitField[]} permissions - The permissions for the slash command
 */
export interface IGuildSlashCommand extends ISlashCommand {
    guildId: string
}

/**
 * Guild Slash Command Class
 * @abstract
 * @param {ISlashCommand} data - The data for the slash command
 * @param {PermissionsBitField[]} permissions - The permissions for the slash command
 */
export abstract class GuildSlashCommand extends SlashCommand implements IGuildSlashCommand {
    guildId!: string
}

/**
 * Context Menu Command Props
 * @param {ContextMenuCommandBuilder} data - The data for the context menu command
 * @param {2 | 3} type - The type of the context menu command
 */
export type ContextMenuCommandProps<T extends 2 | 3 = 2 | 3> = {
    data: ContextMenuCommandBuilder
    type: T
    execute: (
        interaction: ContextMenuInteractionType<T>,
        helpers: SlashCommandHelpers
    ) => Promise<void>
    permissions?: SlashCommandProps['permissions']
}

/**
 * Context Menu Interaction Type
 * @param {2 | 3} T - The type of the context menu command
 */
export type ContextMenuInteractionType<T extends 2 | 3> = T extends 2
    ? UserContextMenuCommandInteraction
    : MessageContextMenuCommandInteraction

/**
 * Context Menu Command Interface
 * @param {ContextMenuCommandProps} data - The data for the context menu command
 * @param {2 | 3} type - The type of the context menu command
 */
export interface IContextMenuCommand<T extends 2 | 3 = 2 | 3> extends ContextMenuCommandProps<T> {}

/**
 * Context Menu Command Class
 * @param {ContextMenuCommandProps} data - The data for the context menu command
 * @param {2 | 3} type - The type of the context menu command
 */
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
