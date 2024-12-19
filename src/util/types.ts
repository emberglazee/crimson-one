import { Guild, BaseInteraction, GuildChannel, Message, GuildMember, User, CommandInteraction, ChatInputCommandInteraction, type APIInteractionDataResolvedChannel, Client } from 'discord.js'

export type GuildIdResolvable = string | Guild | BaseInteraction | GuildChannel | Message
export type UserIdResolvable = GuildMember | User | string | Message
export type ChannelIdResolvable = GuildChannel | Message | CommandInteraction | ChatInputCommandInteraction | string | APIInteractionDataResolvedChannel

/**
 * Provide at least one of the properties of the object
 */
export type AtleastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U]
export interface GuildRecordSettings {
    // bot access
    allowedChannelsType: 'blacklist' | 'whitelist',
    allowedChannelsWhitelist: string[],
    allowedChannelsBlacklist: string[],
    allowedRolesType: 'blacklist' | 'whitelist',
    allowedRolesWhitelist: string[],
    allowedRolesBlacklist: string[],
    blockedUsers: string[],

    // role management
    persistentRoles: string[],
    timedRoles: Record<string, number>,

    // greetings
    greetingsEnabled: boolean,
    greetingsChannel: string|null,
    greetingsMessages: {
        join: string,
        leave: string,
    },

    // moderation
    moderationEnabled: boolean,
    moderationPenaltyLevels: ModerationPenaltyLevel[],
    moderationLogChannel: string|null,
    moderatorRoles: string[],

    // music
    musicEnabled: boolean,
    musicDjRole: string|null,
    musicEveryoneDj: boolean,
    musicSkipVotesRequired: number,
    
    // flags
    perCommandSettings: Record<string, BotCommandSettings>
}
export interface ModerationPenaltyLevel {
    type: 'verbalWarn' | 'warn' | 'mute' | 'kick' | 'ban',
    duration: number,
    warnRole: string,
    muteOrBanDuration: number,
}
export interface BotCommandSettings {
    disabled: boolean
    allowedChannelsType: 'blacklist' | 'whitelist'
    allowedChannelsWhitelist: string[]
    allowedChannelsBlacklist: string[]
    allowedRolesType: 'blacklist' | 'whitelist'
    allowedRolesWhitelist: string[]
    allowedRolesBlacklist: string[]
    blockedUsers: string[]
}

export interface DiscordEventListener {
    default: (client: Client) => void
}

export interface TopicAutomodConfig {
    characters: string[]
    length: number
    words: string[]
    default: {
        characters: string[]
        length: number
        words: string[]
    }
}

export interface SmesharikiAiConfig {
    topicmod: TopicAutomodConfig
    acceptTopics: boolean
    acceptMashups: boolean
}

export interface Mashup {
    type: 'mashup'
    id: string
    date: number
    topic: {
        text: string
        id: string
        author: string
        priority: boolean
        date: string
        source: string
    }
    videoId: string
    characters: string[]
    mashupData: {
        audio: {
            mix: string
            vocals: string
        }
        bpm: number
        beatOffset: number
        lengthBeats: number
        lengthSeconds: number
        events: { type: string; time: number; }[]
    }
    isReady: boolean;
    progress: number;
    progressMax: number;
    donations: any[];
}

export interface SmeshchatJSONMessage {
    username: string // `message.author.username`
    serverUsername: string | null // `message.member.nickname`
    currentTime: string // `new Date().toLocaleString()`
    text: string // `message.content`
    respondingToUser: string | null // `(await message.fetchReference()).author.username`
    respondingToText: string | null // `(await message.fetchReference()).content`
}

export interface TelegramTokenMessage {
    token: string
}
export function isTelegramTokenMessage(obj: any): obj is TelegramTokenMessage {
    return 'token' in obj
}

export interface TelegramTopicMessage {
    topic: {
        text: string
        author: string
    }
}
export function isTelegramTopicMessage(obj: any): obj is TelegramTopicMessage {
    return 'topic' in obj
}

export interface TelegramCommunicatorErrorMessage {
    error: 'no_communicator'
}
export function isTelegramCommunicatorErrorMessage(obj: any): obj is TelegramCommunicatorErrorMessage {
    return 'error' in obj && obj.error === 'no_communicator'
}

export interface TelegramOkMessage {
    ok: true
}
export function isTelegramOkMessage(obj: any): obj is TelegramOkMessage {
    return 'ok' in obj
}

export type SocketIOOutcomingMessage = OutcomingMiscMessage | OutcomingTopicMessage | OutcomingMashupMessage
export interface OutcomingMiscMessage {
    type: 'misc'
    data: MiscData
}
export interface OutcomingTopicMessage {
    type: 'topic'
    data: TopicData
}
export type OutcomingMashupMessage = {
    type: 'mashup'
    data: MashupData
}
export interface TopicData {
    text: string
    priority: boolean
    author: string
    source: TopicSource
}
export interface MashupData {
    youtubeURL: string
    author: string
    characters: string[]
}
export type TopicSource = 'telegram' | 'discord' | 'donation' | 'log' | 'manual' | 'youtube' | 'unknown'
export type MiscData = string | number | boolean | { [key: string]: MiscData } | MiscData[]

export type Episode = EpisodeDialog | EpisodeMashup
export interface EpisodeDialog {
    id: string
    type: 'dialog'
    topic?: Topic
    date: number
    characters: string[]
    videoId?: undefined
    dialogData: {
        actions: EpisodeAction[]
        rawText: string
        voiceLines: Record<string, EpisodeVoiceLine>
    }
    mashupData?: undefined
    isReady: boolean
    progress: number
    progressMax: number
    donations: Donation[]
}
export interface EpisodeMashup {
    id: string
    type: 'mashup'
    topic?: Topic
    date: number
    characters: string[]
    videoId: YoutubeVideoID
    dialogData?: undefined
    mashupData: EpisodeMashupData
    isReady: boolean
    progress: number
    progressMax: number
    donations: Donation[]
}
export interface Topic {
    text: string
    id: string
    date: Date
    priority: boolean
    author?: string
    source: TopicSource
}
export interface YoutubeVideoID extends String {
    length: 11
}
export interface EpisodeMashupData {
    audio: {
        mix: string
        vocals: string
    }
    events: EpisodeMashupEvent[]
    bpm: number
    beatOffset: number
    lengthSeconds: number
    lengthBeats: number
}
export interface EpisodeMashupEvent {
    type: 'dropStart' | 'dropEnd' | 'setSinger'
    time: number // in beats
    content?: string
}
export interface EpisodeAction {
    type: 'line'|'narration'
    id: string
    character?: string
    emotion?: string
    content: string
}
export interface EpisodeVoiceLine {
    character?: string
    fetched: boolean
    url: string
    type: 'wav'|'mp3'|'ogg'
}
export interface Donation {
    id: string
    author: string
    message?: string
    amount: number
    currency: "RUB"|"USD"
    date: Date
}
