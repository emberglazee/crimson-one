import {
    AttachmentBuilder, Guild, GuildMember, User,
    type APIInteractionDataResolvedGuildMember,
    type APIInteractionGuildMember,
    type ImageExtension, type ImageSize
} from 'discord.js'
import type { ExplicitAny } from '../types'
import { randomInt } from 'crypto'
import { distance } from 'fastest-levenshtein'

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

const s = 1n
const m = s * 60n
const h = m * 60n
const d = h * 24n
const mo = d * 30n // 30 days
const y = mo * 12n // 360 days
const dec = y * 10n
const cen = dec * 10n
const mil = cen * 10n

const DURATION_UNITS: Record<string, bigint> = {
    s,
    m,
    h,
    d,
    M: mo,
    mo,
    y,
    D: dec,
    de: dec,
    dec,
    ce: cen,
    cen,
    mil,
}

export function parseDuration(durationStr: string): bigint | null {
    const durationRegex = /(\d+)\s*(mil|cen|ce|dec|de|D|y|mo|M|d|h|m|s)/g
    let totalSeconds = 0n

    // Handle specific date strings like "2024-01-01"
    if (!isNaN(Date.parse(durationStr))) {
        const date = new Date(durationStr)
        const diff = BigInt(date.getTime() - Date.now())
        return diff > 0n ? diff / 1000n : null
    }

    let match
    while ((match = durationRegex.exec(durationStr)) !== null) {
        const value = BigInt(match[1])
        const unit = match[2] as keyof typeof DURATION_UNITS
        totalSeconds += value * (DURATION_UNITS[unit] ?? 0n)
    }

    return totalSeconds > 0n ? totalSeconds : null
}

export function formatDuration(input: Date | number): string {
    let totalSeconds = input instanceof Date ? Math.floor((input.getTime() - Date.now()) / 1000) : input

    if (totalSeconds <= 0) {
        return "0s"
    }

    const units: Array<[string, number]> = [
        ['y', Number(y)],
        ['mo', Number(mo)],
        ['d', Number(d)],
        ['h', Number(h)],
        ['m', Number(m)],
        ['s', Number(s)],
    ]

    const parts: string[] = []

    for (const [unit, secondsInUnit] of units) {
        if (totalSeconds >= secondsInUnit) {
            const count = Math.floor(totalSeconds / secondsInUnit)
            parts.push(`${count}${unit}`)
            totalSeconds %= secondsInUnit
        }
    }

    return parts.join(' ') || '0s'
}

export async function findMember(guild: Guild, query: string): Promise<GuildMember | null> {
    // by username
    await guild.members.fetch({ query: query, limit: 10 })
    const memberByUsername = guild.members.cache.find(
        member => member.user.username.toLowerCase() === query.toLowerCase()
    )
    if (memberByUsername) return memberByUsername

    // by display name
    let closestMatch: GuildMember | null = null
    let smallestDistance = Infinity
    for (const [_, member] of guild.members.cache) {
        const displayName = member.displayName.toLowerCase()
        const dist = distance(query.toLowerCase(), displayName)
        if (dist < smallestDistance) {
            smallestDistance = dist
            closestMatch = member
        }
    }
    // prevent anything thats more than half the distance
    const threshold = Math.floor(query.length / 2)
    if (closestMatch && smallestDistance <= threshold) {
        return closestMatch
    }

    return null
}
