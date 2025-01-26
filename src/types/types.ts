import {
    Guild, BaseInteraction, GuildChannel, Message, GuildMember, CommandInteraction,
    ChatInputCommandInteraction, type APIInteractionDataResolvedChannel, Client, User
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
