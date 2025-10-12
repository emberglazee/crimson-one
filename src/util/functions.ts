import {
    AttachmentBuilder, Guild, GuildMember,
    PermissionFlagsBits, PermissionOverwrites, User,
    type APIInteractionDataResolvedGuildMember,
    type APIInteractionGuildMember,
    type ImageExtension, type ImageSize,
    type PermissionOverwriteOptions
} from 'discord.js'
import type { ExplicitAny } from '../types'
import { randomInt } from 'crypto'
import { distance } from 'fastest-levenshtein'
import { load } from 'cheerio'
import type { DependencyContainer } from 'tsyringe'
import { unit } from 'mathjs'

// --- Randomization & Array Manipulation ---

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
export function removeDuplicatesAndNulls<T>(array: T[]): T[] {
    return [...new Set(array)].filter(item => item !== undefined && item !== null)
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
export function chance(percentage: number): boolean {
    const clamped = Math.max(0, Math.min(100, percentage))
    if (clamped === 100) return true
    if (clamped === 0) return false
    return randomInt(100) < clamped
}

// --- String, Number & Formatting ---

export const hexStringToNumber = (hex: string) => parseInt(hex.replace('#', ''), 16)
export function pluralize(count: number, singular: string, few: string, many: string) {
    if (count === 1) return singular
    if (count > 1 && count < 5) return few
    return many
}
export function formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}
export const smallFooterNote = <T extends string>(note: T) => `-# - ${note}` as const

// --- Time & Date ---

export const absoluteDiscordTimestamp = (seconds: number) => `<t:${seconds}>`   as const
export const relativeDiscordTimestamp = (seconds: number) => `<t:${seconds}:R>` as const
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
    mil
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
        return '0s'
    }

    const units: Array<[string, number]> = [
        ['y', Number(y)],
        ['mo', Number(mo)],
        ['d', Number(d)],
        ['h', Number(h)],
        ['m', Number(m)],
        ['s', Number(s)]
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

// --- Discord-Specific Utilities ---

export function stringToAttachment(string: string, filename?: string) {
    if (!filename) filename = 'file.txt'
    const buffer = Buffer.from(string, 'utf-8')
    return new AttachmentBuilder(buffer).setName(filename)
}
export const boolToEmoji = (bool: boolean) => bool ? '✅' : '❌'
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
        extension?: ImageExtension
        size?: ImageSize
        useGlobalAvatar?: boolean
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
// For correctly casting `PermissionOverwrites` as `PermissionOverwriteOptions`
export function convertOverwriteToOptions(overwrite: PermissionOverwrites): PermissionOverwriteOptions {
    const options: Record<string, boolean | null> = {}
    for (const perm of Object.keys(PermissionFlagsBits)) {
        const bit = PermissionFlagsBits[perm as keyof typeof PermissionFlagsBits]
        if (overwrite.allow.has(bit)) {
            options[perm] = true
        } else if (overwrite.deny.has(bit)) {
            options[perm] = false
        }
    }
    return options
}

export const dontPing = (content: string) => ({ content, allowedMentions: { parse: [] } })

// --- Type Guards & Object Utilities ---

export function hasProp<T extends object, K extends PropertyKey>(
    obj: unknown,
    prop: K
): obj is T & Record<K, unknown> {
    return typeof obj === 'object' && obj !== null && prop in obj
}

// --- Parsing ---

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
            secure: secure.toUpperCase() === 'TRUE'
        })
    }
    return cookies
}

// --- Unsorted ---

export async function randomProjectWingmanArticle(): Promise<string> {
    const url = 'https://projectwingman.wiki.gg/wiki/Special:AllPages'
    const res = await fetch(url)
    const html = await res.text()
    const $ = load(html)

    // Select all the <a> tags within the list items.
    const articleLinks: string[] = []
    $('#mw-content-text > div.mw-allpages-body > ul > li > a').each((_, element) => {
        const href = $(element).attr('href')
        if (href && href.startsWith('/wiki/') && !href.includes(':')) {
            articleLinks.push(`https://projectwingman.wiki.gg${href}`)
        }
    })

    if (articleLinks.length === 0) {
        throw new Error('No articles found on the page.')
    }

    const randomLink = getRandomElement(articleLinks)
    return randomLink
}

export { sleep } from 'bun'

interface ServiceClass<T> {
    new (...args: any[]): T
}

/**
 * Resolves multiple services from the container at once.
 * @param container The tsyringe container.
 * @param services An array of service classes to resolve.
 * @returns An array of resolved service instances, maintaining tuple order.
 */
export function resolveServices<T extends readonly ServiceClass<any>[] >(
    container: DependencyContainer,
    ...services: T
): { [K in keyof T]: T[K] extends ServiceClass<infer I> ? I : never } {
    return services.map(service => container.resolve(service)) as any
}

export function toFeetInches(value: any): `${number}'${number}` {
    const inches = unit(value).toNumber('inch')
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}`
}

// --- YouTube Utilities ---

export function extractVideoId(url: string): string | null {
    const regex = /(?:(?:music\.)?youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(regex)
    return match ? match[1] : null
}

export function formatYoutubeComment(text: string): string {
    const regex = /<a href="([^"]+)">([^<]+)<\/a>/g
    let decodedText = text.replace(regex, (_match, url, linkText) => {
        const decodedUrl = url.replace(/&amp;/g, '&')
        return `[${linkText}](${decodedUrl})`
    })
    decodedText = decodedText.replace(/<br\s*\/?>/g, '\n')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
    return decodedText
}

// --- Text Manipulation ---

const qwertyLayout = {
    a: ['q', 'w', 's', 'z'], b: ['v', 'g', 'h', 'n'], c: ['x', 'd', 'f', 'v'],
    d: ['s', 'e', 'r', 'f', 'c', 'x'], e: ['w', 'r', 's', 'd'], f: ['d', 'r', 't', 'g', 'v', 'c'],
    g: ['f', 't', 'y', 'h', 'b', 'v'], h: ['g', 'y', 'u', 'j', 'n', 'b'],
    i: ['u', 'o', 'k', 'j'], j: ['h', 'u', 'i', 'k', 'n', 'm'], k: ['j', 'i', 'o', 'l', 'm'],
    l: ['k', 'o', 'p', ';'], m: ['n', 'j', 'k'], n: ['b', 'h', 'j', 'm'],
    o: ['i', 'p', 'l', 'k'], p: ['o', 'l', ';'], q: ['a', 'w'],
    r: ['e', 't', 'd', 'f'], s: ['a', 'w', 'e', 'd', 'x', 'z'],
    t: ['r', 'y', 'f', 'g'], u: ['y', 'i', 'h', 'j'], v: ['c', 'f', 'g', 'b'],
    w: ['q', 'e', 'a', 's'], x: ['z', 's', 'd', 'c'],
    y: ['t', 'u', 'g', 'h'], z: ['a', 's', 'x'],
    ',': ['m'], '.': [','], '/': ['.'], ';': ['l'],
    '[': ['p'], ']': ['[']
}

const jcukenLayout = {
    'а': ['ф', 'ы', 'в'], 'б': ['ь', 'в', 'н'], 'в': ['а', 'ы', 'п', 'ф'],
    'г': ['п', 'р', 'о', 'л'], 'д': ['л', 'ж', 'э'], 'е': ['к', 'н', 'г'],
    'ё': ['э', 'ж', 'е'], 'ж': ['д', 'э', 'х', '.'], 'з': ['щ', 'д', 'х'],
    'и': ['у', 'ш', 'щ'], 'й': ['ц', 'у', 'к'], 'к': ['у', 'е', 'н'],
    'л': ['о', 'р', 'д', 'ж'], 'м': ['и', 'т', 'ь'], 'н': ['е', 'г', 'р'],
    'о': ['л', 'д', 'ж'], 'п': ['р', 'а', 'в'], 'р': ['п', 'к', 'в'],
    'с': ['ч', 'м', 'и'], 'т': ['ь', 'б', 'ю'], 'у': ['ц', 'к', 'е'],
    'ф': ['ы', 'в', 'а'], 'х': ['з', '.', 'ъ'], 'ц': ['й', 'у', 'к'],
    'ч': ['с', 'м', 'и'], 'ш': ['щ', 'з', 'х'], 'щ': ['ш', 'з', 'х'],
    'ъ': ['х', 'ж', 'э'], 'ы': ['ф', 'в', 'а'], 'ь': ['т', 'б', 'ю'],
    'э': ['ж', 'д', 'л'], 'ю': ['б', 'ь', '.'], 'я': ['ч', 'с', 'м']
}

// Define special characters when Shift is held
const shiftSpecials = {
    ',': '<', '.': '>', '/': '?', ';': ':', "'": '"',
    '[': '{', ']': '}', '\\': '|', '`': '~'
}

function isRussianText(text: string): boolean {
    const russianChars = /[а-яА-ЯёЁ]/
    return russianChars.test(text)
}

export function drunkWrite(inputText: string): string {
    const MAX_EXTRA_SPACES = 2
    const MAX_REPEATS = 3

    // In percentages
    const REPEAT_CHAR_CHANCE = 10
    const SHOUTING_MODE_TOGGLE_CHANCE = 2
    const EXTRA_SPACE_CHANCE = 8
    const SKIP_CHAR_CHANCE = 3
    const RANDOM_UPPERCASE_CHANCE = 5
    const SHIFT_SPECIALS_CHANCE = 30
    const ADJACENT_KEY_CHANCE = 10

    function getRandomItem<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)]
    }

    function repeatChar(char: string): string {
        if (chance(REPEAT_CHAR_CHANCE)) {
            return char.repeat(Math.floor(Math.random() * MAX_REPEATS) + 2)
        }
        return char
    }

    let result = ''
    let isShoutingMode = false
    const isRussian = isRussianText(inputText)
    const layoutMap = isRussian ? jcukenLayout : qwertyLayout

    for (let i = 0; i < inputText.length; i++) {
        const char = inputText[i]

        // Randomly enter/exit shouting mode
        if (chance(SHOUTING_MODE_TOGGLE_CHANCE)) isShoutingMode = !isShoutingMode

        // Random extra spaces
        if (chance(EXTRA_SPACE_CHANCE)) result += ' '.repeat(Math.floor(Math.random() * MAX_EXTRA_SPACES) + 1)

        // Skip character (forget to type it)
        if (chance(SKIP_CHAR_CHANCE)) continue

        const lowerChar = char.toLowerCase()

        // Apply case based on shouting mode or random uppercase
        const shouldBeUpper = isShoutingMode || chance(RANDOM_UPPERCASE_CHANCE)
        const finalChar = shouldBeUpper ? lowerChar.toUpperCase() : lowerChar

        // Random shift specials (only for non-Russian text)
        if (!isRussian && shiftSpecials[char as keyof typeof shiftSpecials] && chance(SHIFT_SPECIALS_CHANCE)) {
            result += shiftSpecials[char as keyof typeof shiftSpecials]
            continue
        }

        // Random adjacent key
        if (layoutMap[lowerChar as keyof typeof layoutMap] && chance(ADJACENT_KEY_CHANCE)) {
            result += getRandomItem(layoutMap[lowerChar as keyof typeof layoutMap])
            continue
        }

        // Add potentially repeated character
        result += repeatChar(finalChar)
    }

    return result
}

export function owoTranslate(input: string): string {
    const replaceWords: Record<string, string> = {
        'love': 'wuv',
        'mr': 'mistuh',
        'dog': 'doggo',
        'cat': 'kitteh',
        'hello': 'henwo',
        'hell': 'heck',
        'fuck': 'fwick',
        'fuk': 'fwick',
        'shit': 'shoot',
        'friend': 'fwend',
        'stop': 'stamp',
        'god': 'gosh',
        'dick': 'peepee',
        'penis': 'peepee',
        'damn': 'darn'
    }

    const prefixes = ['OwO', 'hehe', '*nuzzles*', '*blushes*', '*giggles*', '*waises paw*', 'OwO whats this?']
    const suffixes = [':3', '>:3', 'xox', '>3<', 'UwU', 'hehe', 'r@^eJ', '(- • w •)', '(>• w •<)', 'murr~', '(  • ⌒ •)', '(* ⌒Д⌒)', '(   ¡   )', '(  • ω •)', '*gwomps*', '(＾ ω＾)']

    // Replace words
    for (const [key, value] of Object.entries(replaceWords)) {
        const regex = new RegExp(`\b${key}\b`, 'gi')
        input = input.replace(regex, value)
    }

    // R and L to W
    input = input.replace(/[rl]/g, 'w').replace(/[RL]/g, 'W')

    // Y after N with vowel
    input = input.replace(/n([aeiou])/gi, 'ny$1')

    // Repeat words ending in Y
    input = input.replace(/(\b\w*y\b)/gi, '$1 $1')

    // Stuttering effect (10% chance per word)
    input = input.replace(/\b(\w)/g, match => Math.random() < 0.1 ? `${match}-${match}` : match)

    // Add a random prefix (10% chance)
    if (Math.random() < 0.1) {
        input = prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + input
    }

    // Add a random suffix (10% chance)
    if (Math.random() < 0.1) {
        input += ' ' + suffixes[Math.floor(Math.random() * suffixes.length)]
    }

    return input
}
