import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel,
    Client, User, type ImageSize, type ImageExtension,
    type TextBasedChannel,
    type MessageReplyOptions,
    type InteractionReplyOptions,
    InteractionResponse,
    type InteractionDeferReplyOptions,
    type InteractionEditReplyOptions,
    type MessageEditOptions,
    Attachment,
    Role,
    type GuildBasedChannel
} from 'discord.js'
import { EMBERGLAZE_ID, PING_EMBERGLAZE, TYPING_EMOJI } from '../util/constants'

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
import { getUserAvatar, guildMember } from '../util/functions'
import type { ArgumentsCamelCase } from 'yargs'

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

export class CommandContext {
    public readonly client: Client
    public readonly interaction: ChatInputCommandInteraction | null
    public readonly message: Message | null
    public originalMessageReply: Message | null = null
    public readonly args: string[] // for text commands
    public readonly myId: typeof EMBERGLAZE_ID = EMBERGLAZE_ID
    public readonly pingMe: typeof PING_EMBERGLAZE = PING_EMBERGLAZE
    public parsedArgs: ArgumentsCamelCase<{ [key: string]: JSONResolvable }> | null = null
    public subcommandName: string | null = null
    public subcommandGroupName: string | null = null


    constructor(source: ChatInputCommandInteraction | Message, rawArgs?: string[]) {
        this.client = source.client
        if (source instanceof Message) {
            this.message = source
            this.interaction = null
            this.args = rawArgs || []
        } else {
            this.interaction = source as ChatInputCommandInteraction
            this.message = null
            this.args = []
            if (this.interaction.options) {
                try {
                    this.subcommandGroupName = this.interaction.options.getSubcommandGroup(false)
                } catch { this.subcommandGroupName = null }
                 try {
                    this.subcommandName = this.interaction.options.getSubcommand(false)
                } catch { this.subcommandName = null }
            }
        }
    }



    get isInteraction(): boolean { return this.interaction !== null }
    get isMessage(): boolean { return this.message !== null }
    get author(): User { return this.interaction ? this.interaction.user : this.message!.author }
    get user(): User { return this.author }

    get member(): GuildMember | null {
        if (this.interaction) {
            return guildMember(this.interaction.member)
        }
        return this.message!.member
    }

    get guild(): Guild | null { return this.interaction ? this.interaction.guild : this.message!.guild }
    get channel(): TextBasedChannel | null { return this.interaction ? this.interaction.channel : this.message!.channel }

    get memberPermissions(): Readonly<PermissionsBitField> | null {
        if (this.interaction?.memberPermissions) return this.interaction.memberPermissions
        if (this.message?.member?.permissions) return this.message.member.permissions
        return null
    }



    async reply(options: string | InteractionReplyOptions | MessageReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction) {
            if (this.interaction.isRepliable() && !this.interaction.replied && !this.interaction.deferred) {
                return this.interaction.reply(options as string | InteractionReplyOptions)
            } else if (this.interaction.isRepliable()) {
                return this.interaction.followUp(options as string | InteractionReplyOptions)
            }
        } else if (this.message) {
            this.originalMessageReply = await this.message.reply(options as string | MessageReplyOptions)
            return this.originalMessageReply
        }
    }
    async deferReply(options?: InteractionDeferReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction && this.interaction.isRepliable() && !this.interaction.deferred) {
            return this.interaction.deferReply(options)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function') {
                this.originalMessageReply = await channel.send(`${TYPING_EMOJI} ${this.client.user!.displayName} is thinking...`)
                return this.originalMessageReply
            }
        }
    }
    async editReply(options: string | InteractionEditReplyOptions | MessageEditOptions): Promise<Message | void> {
        if (this.interaction && this.interaction.isRepliable()) {
            return this.interaction.editReply(options as string | InteractionEditReplyOptions)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function' && this.originalMessageReply) {
                // If editing with only embeds and no content, erase the message content (like interaction replies)
                if (
                    typeof options === 'object' &&
                    options !== null &&
                    'embeds' in options &&
                    Array.isArray(options.embeds) &&
                    options.embeds.length > 0 &&
                    !('content' in options)
                ) {
                    (options as MessageEditOptions).content = ''
                }
                return this.originalMessageReply.edit(options as string | MessageEditOptions)
            }
        }
    }
    async followUp(options: string | InteractionReplyOptions): Promise<Message | void> {
        if (this.interaction && this.interaction.isRepliable()) {
            return this.interaction.followUp(options)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function' && this.originalMessageReply) {
                return this.originalMessageReply.reply(options as string | MessageReplyOptions)
            }
        }
    }



    private async resolveUser(idOrMention: string): Promise<User | null> {
        if (!idOrMention) return null
        const match = idOrMention.match(/^<@!?(\d+)>$/)
        const id = match ? match[1] : idOrMention
        try {
            return await this.client.users.fetch(id)
        } catch {
            return null
        }
    }

    private async resolveMember(idOrMention: string): Promise<GuildMember | null> {
        if (!idOrMention || !this.guild) return null
        const user = await this.resolveUser(idOrMention)
        if (!user) return null
        try {
            return await this.guild.members.fetch(user.id)
        } catch {
            return null
        }
    }

    private async resolveChannel(idOrNameOrMention: string): Promise<GuildBasedChannel | null> {
        if (!idOrNameOrMention || !this.guild) return null
        const mentionMatch = idOrNameOrMention.match(/^<#(\d+)>$/)
        const id = mentionMatch ? mentionMatch[1] : idOrNameOrMention

        try {
            const channel = await this.client.channels.fetch(id)
            if (channel && 'guildId' in channel && channel.guildId === this.guild.id) return channel
        } catch { /* ignore error, try by name */ }

        // Try by name (case-insensitive)
        const channelByName = this.guild.channels.cache.find(
            ch => ch.name.toLowerCase() === idOrNameOrMention.toLowerCase()
        )
        return channelByName || null
    }

    private async resolveRole(idOrNameOrMention: string): Promise<Role | null> {
        if (!idOrNameOrMention || !this.guild) return null
        const mentionMatch = idOrNameOrMention.match(/^<@&(\d+)>$/)
        const id = mentionMatch ? mentionMatch[1] : idOrNameOrMention

        try {
            const role = await this.guild.roles.fetch(id)
            if (role) return role
        } catch { /* ignore error, try by name */ }

        const roleByName = this.guild.roles.cache.find(
            r => r.name.toLowerCase() === idOrNameOrMention.toLowerCase()
        )
        return roleByName || null
    }

    private getScopedInteractionOptions() {
        return this.interaction ? this.interaction.options : null
    }


    async getStringOption(name: string, required: true): Promise<string>
    async getStringOption(name: string, required?: false): Promise<string | null>
    async getStringOption(name: string): Promise<string | null> // required is implicitly false
    async getStringOption(name: string, required?: boolean): Promise<string | null> {
        let value: string | null = null
        if (this.interaction) {
            value = this.interaction.options.getString(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = parsedValue !== undefined && parsedValue !== null ? String(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getIntegerOption(name: string, required: true): Promise<number>
    async getIntegerOption(name: string, required?: false): Promise<number | null>
    async getIntegerOption(name: string): Promise<number | null>
    async getIntegerOption(name: string, required?: boolean): Promise<number | null> {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getInteger(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = Number.isInteger(parsedValue) ? Number(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getBooleanOption(name: string, required: true): Promise<boolean>
    async getBooleanOption(name: string, required?: false): Promise<boolean | null> // Note: boolean can be false, so null means "not provided"
    async getBooleanOption(name: string): Promise<boolean | null>
    async getBooleanOption(name: string, required?: boolean): Promise<boolean | null> {
        let value: boolean | null = null
        if (this.interaction) {
            value = this.interaction.options.getBoolean(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            // For yargs, a boolean flag not present might be undefined. If present, it's true/false.
            value = typeof parsedValue === 'boolean' ? parsedValue : null
        }

        if (required && value === null) { // For booleans, null means "not provided"
            throw new Error(`Required option "${name}" is missing for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getUserOption(name: string, required: true): Promise<User>
    async getUserOption(name: string, required?: false): Promise<User | null>
    async getUserOption(name: string): Promise<User | null>
    async getUserOption(name: string, required?: boolean): Promise<User | null> {
        let value: User | null = null
        if (this.interaction) {
            value = this.interaction.options.getUser(name, required || false)
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveUser(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getMemberOption(name: string, required: true): Promise<GuildMember>
    async getMemberOption(name: string, required?: false): Promise<GuildMember | null>
    async getMemberOption(name: string): Promise<GuildMember | null>
    async getMemberOption(name: string, required?: boolean): Promise<GuildMember | null> {
        let member: GuildMember | null = null
        if (this.interaction) {
            member = guildMember(this.interaction.options.getMember(name))
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            member = parsedVal ? await this.resolveMember(parsedVal) : null
        }

        if (required && member === null) {
            throw new Error(`Required member option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return member
    }

    async getChannelOption(name: string, required: true): Promise<GuildBasedChannel>
    async getChannelOption(name: string, required?: false): Promise<GuildBasedChannel | null>
    async getChannelOption(name: string): Promise<GuildBasedChannel | null>
    async getChannelOption(name: string, required?: boolean): Promise<GuildBasedChannel | null> {
        let value: GuildBasedChannel | null = null
        if (this.interaction) {
            value = this.interaction.options.getChannel(name, required || false) as GuildBasedChannel | null
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveChannel(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getRoleOption(name: string, required: true): Promise<Role>
    async getRoleOption(name: string, required?: false): Promise<Role | null>
    async getRoleOption(name: string): Promise<Role | null>
    async getRoleOption(name: string, required?: boolean): Promise<Role | null> {
        let value: Role | null = null
        if (this.interaction) {
            value = this.interaction.options.getRole(name, required || false) as Role | null
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveRole(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getNumberOption(name: string, required: true): Promise<number>
    async getNumberOption(name: string, required?: false): Promise<number | null>
    async getNumberOption(name: string): Promise<number | null>
    async getNumberOption(name: string, required?: boolean): Promise<number | null> {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getNumber(name, required || false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = typeof parsedValue === 'number' ? parsedValue : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    async getAttachmentOption(name: string, required: true): Promise<Attachment>
    async getAttachmentOption(name: string, required?: false): Promise<Attachment | null>
    async getAttachmentOption(name: string): Promise<Attachment | null>
    async getAttachmentOption(name: string, required?: boolean): Promise<Attachment | null> {
        let value: Attachment | null = null
        if (this.interaction) {
            value = this.interaction.options.getAttachment(name, required || false)
        } else if (this.message && this.parsedArgs) {
            const attachmentFlagPresent = this.parsedArgs[name] === true || typeof this.parsedArgs[name] === 'string'
            if (attachmentFlagPresent && this.message.attachments.size > 0) {
                value = this.message.attachments.first()! // Non-null assertion as size > 0
            }
        }

        if (required && value === null) {
            throw new Error(`Required attachment "${name}" is missing or was not provided correctly for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        return value
    }

    public getSubcommand(required?: false): string | null;
    public getSubcommand(required: true): string;
    public getSubcommand(required?: boolean): string | null {
        if (required && !this.subcommandName) {
            throw new Error('A subcommand was required but not provided or identified.')
        }
        return this.subcommandName
    }

    public getSubcommandGroup(required?: false): string | null;
    public getSubcommandGroup(required: true): string;
    public getSubcommandGroup(required?: boolean): string | null {
        if (required && !this.subcommandGroupName) {
            throw new Error('A subcommand group was required but not provided or identified.')
        }
        return this.subcommandGroupName
    }



    // getUserAvatar needs to be adapted or the CommandContext needs to provide user/guild
    public getUserAvatar(user: User, guild?: Guild | null, options?: { extension?: ImageExtension, size?: ImageSize, useGlobalAvatar?: boolean }): string {
        return getUserAvatar(user, guild || this.guild, options)
    }
}

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
