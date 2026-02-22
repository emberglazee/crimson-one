import { Logger } from '../Logger'
const logger = new Logger('CommandContext')

import {
    Message,
    InteractionResponse,
    MessageFlags, DiscordAPIError,
    PermissionsBitField,
    ApplicationIntegrationType
} from 'discord.js'
import type {
    Role, InteractionEditReplyOptions, ImageExtension, User,
    ImageSize, TextBasedChannel, MessageReplyOptions, GuildMember,
    InteractionReplyOptions, InteractionDeferReplyOptions,
    GuildBasedChannel, MessageEditOptions, Client,
    Guild, Attachment,
    ChatInputCommandInteraction
} from 'discord.js'
import type { Message as StoatMessage } from 'stoat.js'

import { getUserAvatar, guildMember } from '../../util/functions'

import { BotInstallationType, type JSONResolvable } from '../../types'

import { EMBI_ID, PING_EMBI, TYPING_EMOJI } from '../../util/constants'
import type { ArgumentsCamelCase } from 'yargs'
import type { BanishmentManager, BotSettingsManager, CrimsonChat, ServerConfigManager, LongTermMemoryManager, MarkovChat, OperationTracker, TagManager, CommandManager, MarkovBotManager } from '..'

export interface CommandContextServices {
    banishmentManager: BanishmentManager
    crimsonChat: CrimsonChat
    serverConfigManager: ServerConfigManager
    markovChat: MarkovChat
    tagManager: TagManager
    operationTracker: OperationTracker
    botSettingsManager: BotSettingsManager
    commandManager: CommandManager
    longTermMemoryManager: LongTermMemoryManager
    markovBotManager: MarkovBotManager
}

export class CommandContext<InGuild extends boolean = boolean> {
    private originalMessageReply: Message | null = null
    public chainedReplies: (Message | StoatMessage)[] = []

    public readonly client: Client<true>
    public readonly interaction: ChatInputCommandInteraction | null
    public readonly message: Message | null
    public readonly stoatMessage: StoatMessage | null
    public readonly embiId: typeof EMBI_ID = EMBI_ID
    public readonly pingEmbi: typeof PING_EMBI = PING_EMBI

    public readonly args: string[]
    public parsedArgs: ArgumentsCamelCase<{ [key: string]: JSONResolvable }> | null = null
    public subcommandName: string | null = null
    public subcommandGroupName: string | null = null

    public readonly guild: InGuild extends true ? Guild : Guild | null
    public readonly member: InGuild extends true ? GuildMember : GuildMember | null

    // Services
    public readonly banishmentManager: BanishmentManager
    public readonly crimsonChat: CrimsonChat
    public readonly serverConfigManager: ServerConfigManager
    public readonly markovChat: MarkovChat
    public readonly tagManager: TagManager
    public readonly operationTracker: OperationTracker
    public readonly botSettingsManager: BotSettingsManager
    public readonly commandManager: CommandManager
    public readonly longTermMemoryManager: LongTermMemoryManager
    public readonly markovBotManager: MarkovBotManager


    constructor(source: ChatInputCommandInteraction | Message | StoatMessage, services: CommandContextServices, rawArgs?: string[]) {
        // Inject services
        this.banishmentManager = services.banishmentManager
        this.crimsonChat = services.crimsonChat
        this.serverConfigManager = services.serverConfigManager
        this.markovChat = services.markovChat
        this.tagManager = services.tagManager
        this.operationTracker = services.operationTracker
        this.botSettingsManager = services.botSettingsManager
        this.commandManager = services.commandManager
        this.longTermMemoryManager = services.longTermMemoryManager
        this.markovBotManager = services.markovBotManager

        if (source instanceof Message) {
            this.client = source.client
            this.message = source
            this.interaction = null
            this.stoatMessage = null
            this.args = rawArgs || []
            this.guild = this.message.guild as InGuild extends true ? Guild : Guild | null
            this.member = this.message.member as InGuild extends true ? GuildMember : GuildMember | null
        } else if ('reply' in source && 'deferReply' in source) { // Check for interaction methods
            this.interaction = source as ChatInputCommandInteraction
            this.client = this.interaction.client
            this.message = null
            this.stoatMessage = null
            this.args = []
            if (this.interaction.options) {
                try {
                    this.subcommandGroupName = this.interaction.options.getSubcommandGroup(false)
                } catch { this.subcommandGroupName = null }
                try {
                    this.subcommandName = this.interaction.options.getSubcommand(false)
                } catch { this.subcommandName = null }
            }
            this.guild = this.interaction.guild as InGuild extends true ? Guild : Guild | null
            this.member = guildMember(this.interaction.member) as InGuild extends true ? GuildMember : GuildMember | null
        } else {
            // Stoat Message
            this.stoatMessage = source as StoatMessage
            this.client = services.commandManager['client'] as Client<true>

            this.message = null
            this.interaction = null
            this.args = rawArgs || []
            this.guild = null as (InGuild extends true ? Guild : Guild | null)
            this.member = null as (InGuild extends true ? GuildMember : GuildMember | null)
        }
    }

    get isInteraction(): boolean { return this.interaction !== null }
    get isMessage(): boolean { return this.message !== null }
    get isStoat(): boolean { return this.stoatMessage !== null }
    get author(): User {
        if (this.interaction) return this.interaction.user
        if (this.message) return this.message.author
        if (this.stoatMessage) {
            // Method to log and return placeholder 'unknown' string for undefined properties
            const returnUnknown = <T = 'unknown'>(property: string, override?: T): T => {
                logger.warn(`[CommandContext] {author()} Stoat message author is missing property: ${property}. Returning '${override}'.`)
                return (override ?? 'unknown') as T
            }
            // TODO: implement a common User interface and write adapters instead
            return {
                id: this.stoatMessage.author?.id ?? returnUnknown('id'),
                username: this.stoatMessage.author?.username ?? returnUnknown('username'),
                discriminator: this.stoatMessage.author?.discriminator ?? '0', // Stoat _does_ have discriminators, not sure why the property can be undefined though
                bot: !!this.stoatMessage.author?.bot, // stoat.js returns `{ owner: string } | undefined`, so convert to boolean to match discord.js
                toString: () => this.stoatMessage?.author ? `<@${this.stoatMessage.author.id}>` : returnUnknown('toString', '<@unknown>'),
                displayAvatarURL: () => this.stoatMessage?.author?.avatarURL ?? returnUnknown('displayAvatarURL'),
                accentColor: null, // Not in stoat.js
                avatar: this.stoatMessage.author?.avatarURL ?? null,
                avatarDecoration: null, // Deprecated in favor of `avatarDecorationData`
                avatarDecorationData: null, // Not in Stoat at all
                banner: null, // TODO: Not in stoat.js but in Stoat itself; fetch it ourselves?
                createdAt: this.stoatMessage.author?.createdAt ?? returnUnknown('createdAt', new Date(0)),
                createdTimestamp: this.stoatMessage.author?.createdAt.getTime() ?? 0,
                displayName: this.stoatMessage.author?.displayName ?? returnUnknown('displayName'),
                collectibles: null, // Not in Stoat at all
                defaultAvatarURL: this.stoatMessage.author?.defaultAvatarURL ?? returnUnknown('defaultAvatarURL')
                // ...add other necessary properties/methods as needed or cast to User
            } as User // FIX: Not the full discord.js User object but treat as such to avoid editor-time type errors. DOES NOT AVOID RUN-TIME ERRORS! Edit out `as User` to see missing properties in the TypeScript error.
        }
        throw new Error('Cannot access Discord User object from unknown context')
    }
    get user(): User { return this.author }
    get isEmbi(): boolean {
        if (this.stoatMessage) {
            // Check Stoat user ID (assuming consistent IDs or mapping)
            // Ideally we'd have a cross-platform ID check
            return false // Placeholder
        }
        return this.user.id === this.embiId
    }

    public async checkEmbi(options: { andReply?: boolean } = { andReply: true }): Promise<boolean> {
        if (this.isEmbi) {
            return true
        }
        if (options.andReply) {
            await this.reply('❌ You, solely, are responsible for this.')
        }
        return false
    }

    get channel(): TextBasedChannel | null {
        return this.interaction ? this.interaction.channel : (this.message ? this.message.channel : null)
    }

    get memberPermissions(): Readonly<PermissionsBitField> | null {
        if (this.interaction?.memberPermissions) return this.interaction.memberPermissions
        if (this.message?.member?.permissions) return this.message.member.permissions
        return null
    }

    async reply(options: string | InteractionReplyOptions | MessageReplyOptions): Promise<Message | InteractionResponse | StoatMessage | void> {
        if (this.interaction) {
            if (this.interaction.isRepliable() && !this.interaction.replied && !this.interaction.deferred) {
                const reply = await this.interaction.reply(options as string | InteractionReplyOptions)
                if (reply) this.chainedReplies.push(await reply.fetch())
                return reply
            } else if (this.interaction.isRepliable()) {
                const reply = await this.interaction.followUp(options as string | InteractionReplyOptions)
                if (reply) this.chainedReplies.push(reply)
                return reply
            }
        } else if (this.message) {
            this.originalMessageReply = await this.message.reply(options as string | MessageReplyOptions)
            if (this.originalMessageReply) this.chainedReplies.push(this.originalMessageReply)
            return this.originalMessageReply
        } else if (this.stoatMessage) {
            const content = typeof options === 'string' ? options : (options as MessageReplyOptions).content || ''
            try {
                const reply = await this.stoatMessage.reply(content)
                if (reply) this.chainedReplies.push(reply)
                logger.info(`[CommandContext] Stoat reply successful: "${content}"`)
                return reply
            } catch (error) {
                logger.error(`[CommandContext] Stoat reply failed: ${error}`)
                // Attempt fallback if channel is missing on message object
                if (this.stoatMessage.channelId) {
                    try {
                        logger.info(`[CommandContext] Attempting fallback reply via channel ID ${this.stoatMessage.channelId}`)
                        // We need access to the client. this.client is DiscordClient<true>.
                        // But we can try to access the underlying stoat client if we are lucky or pass it in services.
                        // Actually, we can use the message object to get the client if it's exposed (it's private #client).
                        // Let's just log the error for now, as we don't have easy access to the stoat client here.
                    } catch (e) {
                        logger.error(`[CommandContext] Fallback failed: ${e}`)
                    }
                }
            }
        }
    }

    public async ephemeralReply(options: string | InteractionReplyOptions | MessageReplyOptions): Promise<Message | InteractionResponse | StoatMessage | void> {
        if (this.interaction) {
            const replyOptions: InteractionReplyOptions = typeof options === 'string'
                ? { content: options, flags: MessageFlags.Ephemeral }
                : { ...options as InteractionReplyOptions, flags: MessageFlags.Ephemeral }

            if (this.interaction.isRepliable() && !this.interaction.replied && !this.interaction.deferred) {
                return this.interaction.reply(replyOptions)
            } else if (this.interaction.isRepliable()) {
                return this.interaction.followUp(replyOptions)
            }
        } else if (this.message) {
            try {
                const dmChannel = await this.author.createDM()
                await dmChannel.send(options as string | MessageReplyOptions)
            } catch (error) {
                logger.warn(`{ephemeralReply} Could not DM user ${this.author.tag} (${this.author.id}). Replying to channel instead. Error: ${error instanceof DiscordAPIError ? error.message : error}`)
                const errorMessage = typeof options === 'string'
                    ? `I tried to send you a private message, but I couldn't. Please check your privacy settings. (Original message: "${options.substring(0, 100)}${options.length > 100 ? '...' : ''}")`
                    : 'I tried to send you a private message, but I couldn\'t. Please check your privacy settings.'

                await this.message.reply({
                    content: `❌ ${errorMessage}`,
                    allowedMentions: { repliedUser: false }
                }).catch(err => {
                    logger.warn(`{ephemeralReply} Failed to send fallback error reply to message: ${err.message}`)
                })
            }
        } else if (this.stoatMessage) {
            const content = typeof options === 'string' ? options : (options as MessageReplyOptions).content || ''
            return this.stoatMessage.reply(content)
        }
    }

    async deferReply(options?: InteractionDeferReplyOptions): Promise<Message | InteractionResponse | StoatMessage | void> {
        if (this.interaction && this.interaction.isRepliable() && !this.interaction.deferred) {
            return this.interaction.deferReply(options)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function') {
                this.originalMessageReply = await this.message.reply(`${TYPING_EMOJI} ${this.client.user.displayName} is thinking...`)
                return this.originalMessageReply
            }
        } else if (this.stoatMessage) {
            return this.stoatMessage.reply(`${TYPING_EMOJI} thinking...`)
        }
    }

    async editReply(options: string | InteractionEditReplyOptions | MessageEditOptions): Promise<Message | StoatMessage | void> {
        if (this.interaction && this.interaction.isRepliable()) {
            const reply = await this.interaction.editReply(options as string | InteractionEditReplyOptions)
            if (reply) {
                const index = this.chainedReplies.findIndex(m => m.id === reply.id)
                if (index !== -1) this.chainedReplies[index] = reply
                else this.chainedReplies.push(reply)
            }
            return reply
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function' && this.originalMessageReply) {
                if (
                    typeof options === 'object' &&
                    options !== null &&
                    ((
                        'embeds' in options &&
                        Array.isArray(options.embeds) &&
                        options.embeds.length > 0 &&
                        !('content' in options)
                    ) || (
                        'attachments' in options &&
                        Array.isArray(options.attachments) &&
                        options.attachments.length > 0 &&
                        !('content' in options)
                    ))
                ) {
                    (options as MessageEditOptions).content = ''
                }
            }
            const reply = await this.originalMessageReply!.edit(options as string | MessageEditOptions)
            if (reply) {
                const index = this.chainedReplies.findIndex(m => m.id === reply.id)
                if (index !== -1) this.chainedReplies[index] = reply
                else this.chainedReplies.push(reply)
            }
            return reply
        } else if (this.stoatMessage) {
            // Stoat messages are editable if we tracked the reply
            // We assume the last reply is what we want to edit, or we should track it better
            const lastReply = this.chainedReplies[this.chainedReplies.length - 1] as StoatMessage | undefined
            if (lastReply && 'edit' in lastReply) {
                const content = typeof options === 'string' ? options : (options as MessageEditOptions).content || ''
                // Stoat edit signature: edit(data: DataEditMessage): Promise<APIMessage>;
                // DataEditMessage = { content?: string, embeds?: ... }
                await lastReply.edit({ content })
                return lastReply
            }
        }
    }

    async followUp(options: string | InteractionReplyOptions): Promise<Message | StoatMessage | void> {
        if (this.interaction && this.interaction.isRepliable()) {
            const reply = await this.interaction.followUp(options)
            if (reply) this.chainedReplies.push(reply)
            return reply
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function' && this.originalMessageReply) {
                const reply = await this.originalMessageReply.reply(options as string | MessageReplyOptions)
                if (reply) this.chainedReplies.push(reply)
                return reply
            }
        } else if (this.stoatMessage) {
            const content = typeof options === 'string' ? options : (options as MessageReplyOptions).content || ''
            const reply = await this.stoatMessage.reply(content)
            if (reply) this.chainedReplies.push(reply)
            return reply
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

    public getStringOption(name: string, required: true): string
    public getStringOption(name: string, required?: false): string | null
    public getStringOption(name: string): string | null
    public getStringOption(name: string, required?: boolean): string | null
    public getStringOption(name: string, required: true, defaultValue?: undefined): string
    public getStringOption(name: string, required: false, defaultValue: string): string
    public getStringOption(name: string, required?: boolean, defaultValue?: string): string | null
    public getStringOption(name: string, required?: boolean, defaultValue?: string | null): string | null {
        let value: string | null = null
        if (this.interaction) {
            value = this.interaction.options.getString(name, false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = parsedValue !== undefined && parsedValue !== null ? String(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getIntegerOption(name: string, required: true): number
    public getIntegerOption(name: string, required?: false): number | null
    public getIntegerOption(name: string): number | null
    public getIntegerOption(name: string, required?: boolean): number | null
    public getIntegerOption(name: string, required: true, defaultValue?: undefined): number
    public getIntegerOption(name: string, required: false, defaultValue: number): number
    public getIntegerOption(name: string, required?: boolean, defaultValue?: number): number | null
    public getIntegerOption(name: string, required?: boolean, defaultValue?: number | null): number | null {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getInteger(name, false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = Number.isInteger(parsedValue) ? Number(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`The required option "${name}" is missing or invalid.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getBooleanOption(name: string, required: true): boolean
    public getBooleanOption(name: string, required?: false): boolean | null
    public getBooleanOption(name: string): boolean | null
    public getBooleanOption(name: string, required?: boolean): boolean | null
    public getBooleanOption(name: string, required: true, defaultValue?: undefined): boolean
    public getBooleanOption(name: string, required: false, defaultValue: boolean): boolean
    public getBooleanOption(name: string, required?: boolean, defaultValue?: boolean): boolean | null
    public getBooleanOption(name: string, required?: boolean, defaultValue?: boolean | null): boolean | null {
        let value: boolean | null = null
        if (this.interaction) {
            value = this.interaction.options.getBoolean(name, false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = typeof parsedValue === 'boolean' ? parsedValue : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined && defaultValue !== null) {
            return defaultValue
        }
        return value
    }

    public async getUserOption(name: string, required: true): Promise<User>
    public async getUserOption(name: string, required?: false): Promise<User | null>
    public async getUserOption(name: string): Promise<User | null>
    public async getUserOption(name: string, required?: boolean): Promise<User | null>
    public async getUserOption(name: string, required: true, defaultValue?: undefined): Promise<User>
    public async getUserOption(name: string, required: false, defaultValue: User): Promise<User>
    public async getUserOption(name: string, required?: boolean, defaultValue?: User): Promise<User | null>
    public async getUserOption(name: string, required?: boolean, defaultValue?: User | null): Promise<User | null> {
        let value: User | null = null
        if (this.interaction) {
            value = this.interaction.options.getUser(name, false)
        } else if (this.parsedArgs && (this.message || this.stoatMessage)) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            // If on Stoat, resolving user from string arg is tricky without Discord client context for that ID.
            // For now, if we have a parsedVal, we try to resolve it if it looks like a Discord ID, or return null if it fails.
            // But if we are on Stoat, this.client is Discord client. So resolveUser will look up Discord users.
            // This is "correct" if we assume cross-platform IDs or arguments are Discord IDs.
            value = parsedVal ? await this.resolveUser(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`The required option "${name}" is missing or could not be resolved.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            if (!defaultValue) return null
            try {
                return await this.client.users.fetch(defaultValue.id)
            } catch {
                return defaultValue
            }
        }
        return value
    }

    public async getMemberOption(name: string, required: true): Promise<GuildMember>
    public async getMemberOption(name: string, required?: false): Promise<GuildMember | null>
    public async getMemberOption(name: string): Promise<GuildMember | null>
    public async getMemberOption(name: string, required?: boolean): Promise<GuildMember | null>
    public async getMemberOption(name: string, required: true, defaultValue?: undefined): Promise<GuildMember>
    public async getMemberOption(name: string, required: false, defaultValue: GuildMember): Promise<GuildMember>
    public async getMemberOption(name: string, required?: boolean, defaultValue?: GuildMember): Promise<GuildMember | null>
    public async getMemberOption(name: string, required?: boolean, defaultValue?: GuildMember | null): Promise<GuildMember | null> {
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

        if (member === null && !required && defaultValue !== undefined && this.guild) {
            if (!defaultValue) return null
            try {
                return await this.guild.members.fetch(defaultValue.id)
            } catch {
                return defaultValue
            }
        }
        return member
    }

    public async getChannelOption(name: string, required: true): Promise<GuildBasedChannel>
    public async getChannelOption(name: string, required?: false): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string, required?: boolean): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string, required: true, defaultValue?: undefined): Promise<GuildBasedChannel>
    public async getChannelOption(name: string, required: false, defaultValue: GuildBasedChannel): Promise<GuildBasedChannel>
    public async getChannelOption(name: string, required?: boolean, defaultValue?: GuildBasedChannel): Promise<GuildBasedChannel | null>
    public async getChannelOption(name: string, required?: boolean, defaultValue?: GuildBasedChannel | null): Promise<GuildBasedChannel | null> {
        let value: GuildBasedChannel | null = null
        if (this.interaction) {
            value = this.interaction.options.getChannel(name, false) as GuildBasedChannel | null
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveChannel(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public async getRoleOption(name: string, required: true): Promise<Role>
    public async getRoleOption(name: string, required?: false): Promise<Role | null>
    public async getRoleOption(name: string): Promise<Role | null>
    public async getRoleOption(name: string, required?: boolean): Promise<Role | null>
    public async getRoleOption(name: string, required: true, defaultValue?: undefined): Promise<Role>
    public async getRoleOption(name: string, required: false, defaultValue: Role): Promise<Role>
    public async getRoleOption(name: string, required?: boolean, defaultValue?: Role): Promise<Role | null>
    public async getRoleOption(name: string, required?: boolean, defaultValue?: Role | null): Promise<Role | null> {
        let value: Role | null = null
        if (this.interaction) {
            value = this.interaction.options.getRole(name, false) as Role | null
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveRole(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getNumberOption(name: string, required: true): number
    public getNumberOption(name: string, required?: false): number | null
    public getNumberOption(name: string): number | null
    public getNumberOption(name: string, required?: boolean): number | null
    public getNumberOption(name: string, required: true, defaultValue?: undefined): number
    public getNumberOption(name: string, required: false, defaultValue: number): number
    public getNumberOption(name: string, required?: boolean, defaultValue?: number): number | null
    public getNumberOption(name: string, required?: boolean, defaultValue?: number | null): number | null {
        let value: number | null = null
        if (this.interaction) {
            value = this.interaction.options.getNumber(name, false)
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = typeof parsedValue === 'number' ? parsedValue : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getAttachmentOption(name: string, required: true): Attachment
    public getAttachmentOption(name: string, required?: false): Attachment | null
    public getAttachmentOption(name: string): Attachment | null
    public getAttachmentOption(name: string, required?: boolean): Attachment | null
    public getAttachmentOption(name: string, required: true, defaultValue?: undefined): Attachment
    public getAttachmentOption(name: string, required: false, defaultValue: Attachment): Attachment
    public getAttachmentOption(name: string, required?: boolean, defaultValue?: Attachment): Attachment | null
    public getAttachmentOption(name: string, required?: boolean, defaultValue?: Attachment | null): Attachment | null {
        let value: Attachment | null = null
        if (this.interaction) {
            value = this.interaction.options.getAttachment(name, false)
        } else if (this.message && this.parsedArgs) {
            const attachmentFlagPresent = this.parsedArgs[name] === true || typeof this.parsedArgs[name] === 'string'
            if (attachmentFlagPresent && this.message.attachments.size > 0) {
                value = this.message.attachments.first()!
            }
        }

        if (required && value === null) {
            throw new Error(`Required attachment "${name}" is missing or was not provided correctly for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }
        if (value === null && !required && defaultValue !== undefined) {
            return defaultValue
        }
        return value
    }

    public getSubcommand(required?: false): string | null
    public getSubcommand(required: true): string
    public getSubcommand(required?: boolean): string | null {
        if (required && !this.subcommandName) {
            throw new Error('A subcommand was required but not provided or identified.')
        }
        return this.subcommandName
    }

    public getSubcommandGroup(required?: false): string | null
    public getSubcommandGroup(required: true): string
    public getSubcommandGroup(required?: boolean): string | null {
        if (required && !this.subcommandGroupName) {
            throw new Error('A subcommand group was required but not provided or identified.')
        }
        return this.subcommandGroupName
    }

    public getUserAvatar(user: User, guild?: Guild | null, options?: { extension?: ImageExtension, size?: ImageSize, useGlobalAvatar?: boolean }): string {
        return getUserAvatar(user, guild || this.guild, options)
    }

    public getInstallationType(): BotInstallationType {
        if (!this.isInteraction) {
            return BotInstallationType.GuildInstall
        }

        if (!this.interaction!.guildId) {
            return BotInstallationType.UserInstallDM
        }

        const authOwners = this.interaction!.authorizingIntegrationOwners
        if (authOwners && typeof authOwners === 'object') {
            if (Object.prototype.hasOwnProperty.call(authOwners, ApplicationIntegrationType.GuildInstall)) {
                return BotInstallationType.GuildInstall
            }
            if (Object.prototype.hasOwnProperty.call(authOwners, ApplicationIntegrationType.UserInstall)) {
                return BotInstallationType.UserInstallGuild
            }
        }

        return BotInstallationType.Unknown
    }
}
