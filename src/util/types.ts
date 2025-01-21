import { Guild, BaseInteraction, GuildChannel, Message, GuildMember, User, CommandInteraction, ChatInputCommandInteraction, type APIInteractionDataResolvedChannel, Client } from 'discord.js'

export type GuildIdResolvable = string | Guild | BaseInteraction | GuildChannel | Message
export type UserIdResolvable = GuildMember | User | string | Message
export type ChannelIdResolvable = GuildChannel | Message | CommandInteraction | ChatInputCommandInteraction | string | APIInteractionDataResolvedChannel

/**
 * Provide at least one of the properties of the object
 */
export type AtleastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U]

export interface DiscordEventListener {
    default: (client: Client) => void
}
