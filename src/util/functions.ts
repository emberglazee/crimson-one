import {
    AttachmentBuilder, BaseInteraction, ChatInputCommandInteraction,
    CommandInteraction, Guild, GuildChannel, GuildMember, Message, User,
    type APIInteractionDataResolvedGuildMember,
    type APIInteractionGuildMember, type ImageExtension, type ImageSize
} from 'discord.js'
import type { UserIdResolvable, ChannelIdResolvable, GuildIdResolvable, ExplicitAny } from '../types/types'
import { randomInt } from 'crypto'

export const randRange = (min: number, max: number) => randomInt(min, max + 1)
export const getRandomElement = <T>(array: T[]): T => array[randomInt(array.length)]
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}

export const hexStringToNumber = (hex: string) => parseInt(hex.replace('#', ''), 16)
export const appendDateAndTime = (message: string) => {
    const date = new Date()
    return `<${date.toUTCString()}>\n${message}` as const
}

export function extractUserId(userIdResolvable: UserIdResolvable | null) {
    if (!userIdResolvable) return null
    let id = ''
    if (typeof userIdResolvable === 'string') {
        if (userIdResolvable.startsWith('<@') && userIdResolvable.endsWith('>')) {
            id = userIdResolvable.slice(2, -1)
        } else {
            id = userIdResolvable
        }
    }
    if (userIdResolvable instanceof Message) id = userIdResolvable.author.id
    if (userIdResolvable instanceof GuildMember
        || userIdResolvable instanceof User
    ) id = userIdResolvable.id
    return id
}
export function extractChannelId(channelIdResolvable: ChannelIdResolvable) {
    let id = ''
    if (typeof channelIdResolvable === 'string') id = channelIdResolvable
    if (channelIdResolvable instanceof GuildChannel) id = channelIdResolvable.id
    if (channelIdResolvable instanceof Message
        || channelIdResolvable instanceof CommandInteraction
        || channelIdResolvable instanceof ChatInputCommandInteraction
    ) id = channelIdResolvable.channelId
    return id
}
export function extractGuildId(guildIdResolvable: GuildIdResolvable) {
    let id: string | null = ''
    if (typeof guildIdResolvable === 'string') id = guildIdResolvable
    if (guildIdResolvable instanceof Guild) id = guildIdResolvable.id
    if (guildIdResolvable instanceof BaseInteraction
        || guildIdResolvable instanceof Message
        || guildIdResolvable instanceof GuildChannel
    ) id = guildIdResolvable.guildId
    return id
}

export function removeDuplicatesAndNulls<T>(array: T[]): T[] {
    return [...new Set(array)].filter(item => item !== undefined && item !== null)
}

export const relativeTimestamp = (seconds: number) => `<t:${seconds}:R>` as const

export function stringToAttachment(string: string, filename?: string) {
    if (!filename) filename = 'file.txt'
    const buffer = Buffer.from(string, 'utf-8')
    return new AttachmentBuilder(buffer).setName(filename)
}
export function pluralize(count: number, singular: string, few: string, many: string) {
    if (count === 1) return singular
    if (count > 1 && count < 5) return few
    return many
}

export const boolToEmoji = (bool: boolean) => bool ? '✅' : '❌'

export function formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}

export function chance(percentage: number): boolean {
    const clamped = Math.max(0, Math.min(100, percentage))
    if (clamped === 100) return true
    if (clamped === 0) return false
    return randomInt(100) < clamped
}

export function hasProp<T extends object, K extends PropertyKey>(
    obj: unknown,
    prop: K
): obj is T & Record<K, unknown> {
    return typeof obj === 'object' && obj !== null && prop in obj
}

export function removeDuplicatesByKey<T>(arr: T[], key: (item: T) => ExplicitAny): T[] {
    const map = new Map()
    return arr.reduce((acc: T[], item: T) => {
        if (!map.has(key(item))) {
            map.set(key(item), true)
            acc.push(item)
        }
        return acc
    }, [])
}

/**
 * Format seconds into a human-readable time string
 */
export function formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = Math.round(seconds % 60)
        return `${minutes}m ${remainingSeconds}s`
    } else {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const remainingSeconds = Math.round(seconds % 60)
        return `${hours}h ${minutes}m ${remainingSeconds}s`
    }
}

export function hasYouTubeLinkWithSI(input: string): boolean {
    const youtubeUrlRegex = /(https?:\/\/(?:www\.|music\.)?(youtube\.com|youtu\.be)\/[^\s]+)/gi
    const matches = input.match(youtubeUrlRegex)
    if (!matches) return false
    for (const urlStr of matches) {
        try {
            const url = new URL(urlStr)
            const hasYouTubeDomain = url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')
            if (hasYouTubeDomain && url.searchParams.has('si')) return true
        } catch { continue }
    }
    return false
}

/**
 * Type-safe function to exclude `APIInteractionGuildMember` from `GuildMember | null`
 */
export function guildMember(member: GuildMember | APIInteractionGuildMember | APIInteractionDataResolvedGuildMember | null): GuildMember | null {
    if (!member) return null
    if (member instanceof GuildMember) return member
    return null
}

export function getUserAvatar(
    user: User,
    guild: Guild | null,
    options: {
        extension?: ImageExtension;
        size?: ImageSize;
        useGlobalAvatar?: boolean;
    } = {}
): string {
    const {
        extension = 'png',
        size = 1024,
        useGlobalAvatar = false
    } = options

    if (useGlobalAvatar || !guild) {
        return user.displayAvatarURL({ extension, size })
    }

    const member = guild.members.cache.get(user.id)
    if (!member) {
        return user.displayAvatarURL({ extension, size })
    }

    return member.displayAvatarURL({ extension, size })
}

/**
 * Parse a Netscape cookie file and return an array of Playwright-compatible cookie objects.
 * @param fileContent The content of the cookie file as a string
 * @returns Array of cookies { name, value, domain, path, expires, httpOnly, secure }
 */
export function parseNetscapeCookieFile(fileContent: string) {
    const lines = fileContent.split(/\r?\n/)
    const cookies = []
    for (const line of lines) {
        if (!line || line.startsWith('#')) continue // skip comments and empty lines
        const parts = line.split('\t')
        if (parts.length < 7) continue

        const [domain, _flag, path, secure, expiresStr, name, value] = parts

        const expires = Number(expiresStr)
        cookies.push({
            name: name.trim(),
            value: value.trim(),
            domain,
            path,
            expires: isNaN(expires) ? -1 : expires,
            httpOnly: false, // Not available in cookies.txt format
            secure: secure.toUpperCase() === 'TRUE',
        })
    }
    return cookies
}

export const smallFooterNote = (note: string) => `-# - ${note}` as const
