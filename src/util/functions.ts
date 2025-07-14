import {
    AttachmentBuilder, Guild, GuildMember, User,
    type APIInteractionDataResolvedGuildMember,
    type APIInteractionGuildMember,
    type ImageExtension, type ImageSize
} from 'discord.js'
import type { ExplicitAny } from '../types'
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

export function removeDuplicatesAndNulls<T>(array: T[]): T[] {
    return [...new Set(array)].filter(item => item !== undefined && item !== null)
}

export const absoluteDiscordTimestamp = (seconds: number) => `<t:${seconds}>`   as const
export const relativeDiscordTimestamp = (seconds: number) => `<t:${seconds}:R>` as const

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

export const smallFooterNote = <T extends string>(note: T) => `-# - ${note}` as const

export function dateToDiscordEpoch(date: Date): number {
    const DISCORD_EPOCH = new Date('2015-01-01T00:00:00Z').getTime()
    const currentUnixTimestamp = date.getTime()
    if (DISCORD_EPOCH > currentUnixTimestamp) return 0
    return currentUnixTimestamp - DISCORD_EPOCH
}

export function parseDuration(durationStr: string): bigint | null {
    const durationRegex = /(\d+)\s*(d|h|m|s)/g
    let totalSeconds = 0n // Use BigInt for seconds
    let match

    // Handle specific date strings
    if (!isNaN(Date.parse(durationStr))) {
        const date = new Date(durationStr)
        const diff = BigInt(date.getTime() - Date.now())
        return diff > 0n ? diff / 1000n : null // return seconds
    }

    while ((match = durationRegex.exec(durationStr)) !== null) {
        const value = BigInt(parseInt(match[1]))
        const unit = match[2]

        switch (unit) {
            case 'D':
                totalSeconds += value * 10n * 12n * 30n * 24n * 60n * 60n
                break
            case 'y':
                totalSeconds += value * 12n * 30n * 24n * 60n * 60n
                break
            case 'M':
                totalSeconds += value * 30n * 24n * 60n * 60n
                break
            case 'd':
                totalSeconds += value * 24n * 60n * 60n
                break
            case 'h':
                totalSeconds += value * 60n * 60n
                break
            case 'm':
                totalSeconds += value * 60n
                break
            case 's':
                totalSeconds += value
                break
        }
    }

    return totalSeconds > 0n ? totalSeconds : null
}
