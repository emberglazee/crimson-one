import { Logger } from '../../util/logger'
const logger = new Logger('CommandContext')

import {
    Message,
    InteractionResponse,
    MessageFlags, DiscordAPIError,
    PermissionsBitField,
    ApplicationIntegrationType
} from 'discord.js'
import type {
    Role,
    InteractionEditReplyOptions, ImageExtension, User,
    ImageSize, TextBasedChannel, MessageReplyOptions, GuildMember,
    InteractionReplyOptions, InteractionDeferReplyOptions,
    GuildBasedChannel, MessageEditOptions, Client,
    Guild, Attachment,
    ChatInputCommandInteraction,
} from 'discord.js'

import { getUserAvatar, guildMember } from '../../util/functions'

import { BotInstallationType } from '../../types'
import type {
    JSONResolvable,
} from '../../types'

import { EMBI_ID, PING_EMBI, TYPING_EMOJI } from '../../util/constants'
import type { ArgumentsCamelCase } from 'yargs'

export class CommandContext<InGuild extends boolean = boolean> {
    private originalMessageReply: Message | null = null
    public chainedReplies: Message[] = []

    public readonly client: Client<true>
    public readonly interaction: ChatInputCommandInteraction | null
    public readonly message: Message | null
    public readonly embiId: typeof EMBI_ID = EMBI_ID
    public readonly pingEmbi: typeof PING_EMBI = PING_EMBI

    public readonly args: string[]
    public parsedArgs: ArgumentsCamelCase<{ [key: string]: JSONResolvable }> | null = null
    public subcommandName: string | null = null
    public subcommandGroupName: string | null = null

    public readonly guild: InGuild extends true ? Guild : Guild | null
    public readonly member: InGuild extends true ? GuildMember : GuildMember | null


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
        this.guild = (this.interaction ? this.interaction.guild : this.message!.guild) as InGuild extends true ? Guild : Guild | null
        this.member = (this.interaction ? guildMember(this.interaction.member) : this.message!.member) as InGuild extends true ? GuildMember : GuildMember | null
    }



    get isInteraction(): boolean { return this.interaction !== null }
    get isMessage(): boolean { return this.message !== null }
    get author(): User { return this.interaction ? this.interaction.user : this.message!.author }
    get user(): User { return this.author }
    get isEmbi(): boolean { return this.user.id === this.embiId }

    get channel(): TextBasedChannel | null { return this.interaction ? this.interaction.channel : this.message!.channel }

    get memberPermissions(): Readonly<PermissionsBitField> | null {
        if (this.interaction?.memberPermissions) return this.interaction.memberPermissions
        if (this.message?.member?.permissions) return this.message.member.permissions
        return null
    }



    async reply(options: string | InteractionReplyOptions | MessageReplyOptions): Promise<Message | InteractionResponse | void> {
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
        }
    }
    public async ephemeralReply(options: string | InteractionReplyOptions | MessageReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction) {
            // For slash commands, use ephemeral interaction reply
            const replyOptions: InteractionReplyOptions = typeof options === 'string'
                ? { content: options, flags: MessageFlags.Ephemeral }
                : { ...options as InteractionReplyOptions, flags: MessageFlags.Ephemeral }

            if (this.interaction.isRepliable() && !this.interaction.replied && !this.interaction.deferred) {
                return this.interaction.reply(replyOptions)
            } else if (this.interaction.isRepliable()) {
                return this.interaction.followUp(replyOptions)
            }
        } else if (this.message) {
            // For text commands, attempt to DM the user
            try {
                const dmChannel = await this.author.createDM()
                await dmChannel.send(options as string | MessageReplyOptions)
            } catch (error) {
                logger.warn(`{ephemeralReply} Could not DM user ${this.author.tag} (${this.author.id}). Replying to channel instead. Error: ${error instanceof DiscordAPIError ? error.message : error}`)
                const errorMessage = typeof options === 'string'
                    ? `I tried to send you a private message, but I couldn't. Please check your privacy settings. (Original message: "${options.substring(0, 100)}${options.length > 100 ? '...' : ''}")`
                    : `I tried to send you a private message, but I couldn't. Please check your privacy settings.`

                await this.message.reply({
                    content: `❌ ${errorMessage}`,
                    allowedMentions: { repliedUser: false }
                }).catch(err => {
                    logger.warn(`{ephemeralReply} Failed to send fallback error reply to message: ${err.message}`)
                })
            }
        }
    }
    async deferReply(options?: InteractionDeferReplyOptions): Promise<Message | InteractionResponse | void> {
        if (this.interaction && this.interaction.isRepliable() && !this.interaction.deferred) {
            return this.interaction.deferReply(options)
        } else if (this.message) {
            const channel = this.message.channel
            if (channel && 'send' in channel && typeof channel.send === 'function') {
                this.originalMessageReply = await this.message.reply(`${TYPING_EMOJI} ${this.client.user.displayName} is thinking...`)
                return this.originalMessageReply
            }
        }
    }
    async editReply(options: string | InteractionEditReplyOptions | MessageEditOptions): Promise<Message | void> {
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
                // If editing with only embeds or attachments, and no content, erase the message content (replicates the interaction reply edit behavior)
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
        }
    }
    async followUp(options: string | InteractionReplyOptions): Promise<Message | void> {
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
            value = this.interaction.options.getString(name, false) // Always fetch as non-required first
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
            value = this.interaction.options.getInteger(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            value = Number.isInteger(parsedValue) ? Number(parsedValue) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or invalid for ${this.isInteraction ? 'interaction' : 'text command'}.`)
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
            value = this.interaction.options.getBoolean(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs) {
            const parsedValue = this.parsedArgs[name]
            // For yargs, a boolean flag not present might be undefined. If present, it's true/false.
            value = typeof parsedValue === 'boolean' ? parsedValue : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined && defaultValue !== null) {
            return defaultValue
        }
        // For booleans, if not required and no default, null is a valid "not provided" state.
        // If a default is explicitly null, it should also return null.
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
            value = this.interaction.options.getUser(name, false) // Always fetch as non-required first
        } else if (this.parsedArgs && this.message) {
            const parsedVal = this.parsedArgs[name] as string | undefined
            value = parsedVal ? await this.resolveUser(parsedVal) : null
        }

        if (required && value === null) {
            throw new Error(`Required option "${name}" is missing or could not be resolved for ${this.isInteraction ? 'interaction' : 'text command'}.`)
        }

        if (value === null && !required && defaultValue !== undefined) {
            if (!defaultValue) return null
            try {
                // Try to fetch the default user to ensure it's up to date
                return await this.client.users.fetch(defaultValue.id)
            } catch {
                // If fetch fails, fall back to the provided default value
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
            member = guildMember(this.interaction.options.getMember(name)) // getMember can return APIInteractionGuildMember | GuildMember | null
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
                // Try to fetch the default member to ensure it's up to date
                return await this.guild.members.fetch(defaultValue.id)
            } catch {
                // If fetch fails, fall back to the provided default value
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
            value = this.interaction.options.getChannel(name, false) as GuildBasedChannel | null // Always fetch as non-required first
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
            value = this.interaction.options.getRole(name, false) as Role | null // Always fetch as non-required first
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
            value = this.interaction.options.getNumber(name, false) // Always fetch as non-required first
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
            value = this.interaction.options.getAttachment(name, false) // Always fetch as non-required first
        } else if (this.message && this.parsedArgs) {
            const attachmentFlagPresent = this.parsedArgs[name] === true || typeof this.parsedArgs[name] === 'string'
            if (attachmentFlagPresent && this.message.attachments.size > 0) {
                value = this.message.attachments.first()! // Non-null assertion as size > 0
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



    // getUserAvatar needs to be adapted or the CommandContext needs to provide user/guild
    public getUserAvatar(user: User, guild?: Guild | null, options?: { extension?: ImageExtension, size?: ImageSize, useGlobalAvatar?: boolean }): string {
        return getUserAvatar(user, guild || this.guild, options)
    }



    public async getInstallationType(): Promise<BotInstallationType> {
        // Logic 1: Message Command -> Guaranteed Guild Install
        if (!this.isInteraction) {
            return BotInstallationType.GuildInstall
        }

        // Logic 2: Slash Command - Check if it's a DM/Group DM or a Guild
        if (!this.interaction!.guildId) { // Determined that `interaction` is defined
            return BotInstallationType.UserInstallDM
        }

        // Logic 3: Slash Command in a Guild - Differentiate between Guild and User install
        const authOwners = this.interaction!.authorizingIntegrationOwners
        if (authOwners && typeof authOwners === 'object') {
            // Check if the guild's ID is listed as a GuildInstall owner
            if (Object.prototype.hasOwnProperty.call(authOwners, ApplicationIntegrationType.GuildInstall)) {
                return BotInstallationType.GuildInstall
            }
            // Check if the user's ID is listed as a UserInstall owner
            if (Object.prototype.hasOwnProperty.call(authOwners, ApplicationIntegrationType.UserInstall)) {
                return BotInstallationType.UserInstallGuild
            }
        }

        // Fallback if authorizingIntegrationOwners is not available or doesn't contain expected info
        return BotInstallationType.Unknown
    }
}
