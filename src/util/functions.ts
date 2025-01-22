import { AttachmentBuilder, BaseInteraction, ChatInputCommandInteraction, CommandInteraction, Guild, GuildChannel, GuildMember, Message, User } from 'discord.js'
import { createCanvas, loadImage, registerFont } from 'canvas'
import { type GradientType, TRANS_COLORS, RAINBOW_COLORS, ITALIAN_COLORS } from './colors'
import path from 'path'
import type { UserIdResolvable, ChannelIdResolvable, GuildIdResolvable } from './types'

const robotoPath = path.join(__dirname, '../../data/Roboto.ttf')
const acesPath = path.join(__dirname, '../../data/Aces07.ttf')
registerFont(robotoPath, { family: 'Roboto' })
registerFont(acesPath, { family: 'Aces07' })

export type QuoteStyle = 'pw' | 'ac7'

// Add new helper for emoji codepoint conversion
function toCodePoint(unicodeSurrogates: string) {
    const r = []
    let c = 0
    let p = 0
    let i = 0

    while (i < unicodeSurrogates.length) {
        c = unicodeSurrogates.charCodeAt(i++)
        if (p) {
            r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16))
            p = 0
        } else if (0xD800 <= c && c <= 0xDBFF) {
            p = c
        } else {
            r.push(c.toString(16))
        }
    }
    return r.join('-')
}

export async function createQuoteImage(speaker: string, quote: string, color: string | null, gradient: GradientType, stretchGradient = false, style: QuoteStyle = 'pw') {
    const fontSize = 48
    const lineHeight = fontSize * 1.2
    const padding = 40
    const width = 1024
    const maxWidth = width - padding * 2
    const font = style === 'pw' ? 'Roboto' : 'Aces07'

    // Create canvas for measurements
    const measureCanvas = createCanvas(1, 1)
    const measureCtx = measureCanvas.getContext('2d')
    measureCtx.font = `${fontSize}px ${font}`

    // Updated helper function to detect and parse both Discord and Unicode emoji
    const parseEmojis = (text: string) => {
        const results: Array<{
            full: string
            id?: string
            name?: string
            index: number
            length: number
            url: string
        }> = []

        // Parse custom Discord emojis
        const customEmojiRegex = /<:([^:]+):(\d+)>/g
        const customMatches = [...text.matchAll(customEmojiRegex)]
        results.push(...customMatches.map(match => ({
            full: match[0],
            name: match[1],
            id: match[2],
            index: match.index!,
            length: match[0].length,
            url: `https://cdn.discordapp.com/emojis/${match[2]}.png?size=48`
        })))

        // Parse Unicode emojis
        // This regex catches most modern emojis including combined ones
        const unicodeEmojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F000}-\u{1FFFF}][\u{FE00}-\u{FE0F}]?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D[\u{1F300}-\u{1F9FF}]|[\u{1F000}-\u{1FFFF}][\u{FE00}-\u{FE0F}]?(?:[\u{1F3FB}-\u{1F3FF}])?)*|[\u{1F300}-\u{1F9FF}]|[\u{1F000}-\u{1FFFF}][\u{FE00}-\u{FE0F}]?/gu
        const unicodeMatches = [...text.matchAll(unicodeEmojiRegex)]
        results.push(...unicodeMatches.map(match => ({
            full: match[0],
            index: match.index!,
            length: match[0].length,
            url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${toCodePoint(match[0])}.png`
        })))

        // Sort by index to maintain order
        return results.sort((a, b) => a.index - b.index)
    }

    // Pre-load all emojis from both speaker and quote
    const speakerEmojis = parseEmojis(speaker)
    const quoteEmojis = parseEmojis(quote)
    const allEmojis = [...speakerEmojis, ...quoteEmojis]
    const emojiImages = await Promise.all(
        allEmojis.map(async emoji => ({
            ...emoji,
            image: await loadImage(emoji.url)
        }))
    )

    const measureWordWidth = (word: string, startIndex: number, emojis: ReturnType<typeof parseEmojis>) => {
        let width = measureCtx.measureText(word).width
        const wordEmojis = emojis.filter(e => 
            e.index >= startIndex && 
            e.index < startIndex + word.length
        )
        // Subtract the width of emoji placeholders and add actual emoji width
        for (const emoji of wordEmojis) {
            width -= measureCtx.measureText(emoji.full).width
            width += fontSize
        }
        return width
    }

    // Word wrap speaker name
    const speakerLines: string[] = []
    let speakerStartIndices: number[] = []
    let currentIndex = 0
    const speakerTextLines = speaker.split('\n')
    
    for (const textLine of speakerTextLines) {
        const words = textLine.split(' ')
        let currentLine = words[0]
        let lineStart = currentIndex
        currentIndex += currentLine.length

        for (let i = 1; i < words.length; i++) {
            const word = words[i]
            const testLine = currentLine + ' ' + word
            const actualWidth = measureWordWidth(testLine, lineStart, speakerEmojis)

            if (actualWidth > maxWidth) {
                speakerLines.push(currentLine)
                speakerStartIndices.push(lineStart)
                currentLine = word
                lineStart = currentIndex + 1
                currentIndex = lineStart + word.length
            } else {
                currentLine = testLine
                currentIndex = lineStart + testLine.length
            }
        }
        speakerLines.push(currentLine)
        speakerStartIndices.push(lineStart)
        currentIndex += 1
    }

    // Word wrap quote with emoji preservation
    const quoteLines: string[] = []
    let lineStartIndices: number[] = []
    currentIndex = 0
    const textLines = quote.split('\n')
    
    for (const textLine of textLines) {
        const words = textLine.split(' ')
        let currentLine = words[0]
        let lineStart = currentIndex
        currentIndex += currentLine.length

        for (let i = 1; i < words.length; i++) {
            const word = words[i]
            const testLine = currentLine + ' ' + word
            const actualWidth = measureWordWidth(testLine, lineStart, quoteEmojis)

            if (actualWidth > maxWidth) {
                quoteLines.push(currentLine)
                lineStartIndices.push(lineStart)
                currentLine = word
                lineStart = currentIndex + 1
                currentIndex = lineStart + word.length
            } else {
                currentLine = testLine
                currentIndex = lineStart + testLine.length
            }
        }
        quoteLines.push(currentLine)
        lineStartIndices.push(lineStart)
        currentIndex += 1
    }

    // Calculate height based on number of lines
    const speakerHeight = speakerLines.length * lineHeight
    const height = 50 + speakerHeight + 2 + (quoteLines.length * lineHeight) + padding

    // Create final canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    const speakerColor = color || '#FFFFFF'
    const gradientColors = gradient === 'trans' ? TRANS_COLORS 
        : gradient === 'rainbow' ? RAINBOW_COLORS 
        : ITALIAN_COLORS

    ctx.clearRect(0, 0, width, height)
    ctx.font = `${fontSize}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'black'
    ctx.shadowBlur = 8
    let y = 50

    // Draw speaker name
    if (gradient === 'none') {
        ctx.fillStyle = speakerColor
        for (let i = 0; i < speakerLines.length; i++) {
            const line = speakerLines[i]
            const lineStart = speakerStartIndices[i]
            const nextLineStart = speakerStartIndices[i + 1] || speaker.length

            const lineEmojis = speakerEmojis.filter(e => 
                e.index >= lineStart && e.index < nextLineStart
            ).sort((a, b) => a.index - b.index)

            const adjustedEmojis = lineEmojis.map(emoji => ({
                ...emoji,
                relativeIndex: emoji.index - lineStart
            }))

            // Calculate total width
            let totalWidth = 0
            let currentPos = 0
            let lineText = line

            for (const emoji of adjustedEmojis) {
                const textBefore = lineText.substring(currentPos, emoji.relativeIndex)
                totalWidth += ctx.measureText(textBefore).width + fontSize
                currentPos = emoji.relativeIndex + emoji.length
            }
            totalWidth += ctx.measureText(lineText.substring(currentPos)).width

            // Draw text and emojis
            const centerX = width / 2
            let currentX = centerX - totalWidth / 2
            currentPos = 0

            for (const emoji of adjustedEmojis) {
                const textBefore = lineText.substring(currentPos, emoji.relativeIndex)
                if (textBefore) {
                    const textWidth = ctx.measureText(textBefore).width
                    ctx.fillText(textBefore, currentX + textWidth/2, y)
                    currentX += textWidth
                }

                const loadedEmoji = emojiImages.find(e => e.id === emoji.id)
                if (loadedEmoji) {
                    ctx.drawImage(loadedEmoji.image, currentX, y + (fontSize * 0.1), fontSize, fontSize)
                }
                currentX += fontSize
                currentPos = emoji.relativeIndex + emoji.length
            }

            const remainingText = lineText.substring(currentPos)
            if (remainingText) {
                const textWidth = ctx.measureText(remainingText).width
                ctx.fillText(remainingText, currentX + textWidth/2, y)
            }

            y += lineHeight
        }
    } else {
        for (const line of speakerLines) {
            let x = width / 2 - ctx.measureText(line).width / 2
            for (let i = 0; i < line.length; i++) {
                const char = line[i]
                const colorIndex = stretchGradient 
                    ? Math.floor((i / line.length) * gradientColors.length)
                    : i % gradientColors.length
                ctx.fillStyle = gradientColors[colorIndex]
                ctx.textAlign = 'left'
                const charWidth = ctx.measureText(char).width
                ctx.fillText(char, x, y)
                x += charWidth
            }
            y += lineHeight
        }
        ctx.textAlign = 'center'
    }

    // Draw quote
    ctx.fillStyle = 'white'
    y += 2

    for (let i = 0; i < quoteLines.length; i++) {
        const line = quoteLines[i]
        const lineStart = lineStartIndices[i]
        const nextLineStart = lineStartIndices[i + 1] || quote.length
        
        const lineEmojis = quoteEmojis.filter(e => 
            e.index >= lineStart && e.index < nextLineStart
        ).sort((a, b) => a.index - b.index)

        // Adjust emoji indices relative to line start
        const adjustedEmojis = lineEmojis.map(emoji => ({
            ...emoji,
            relativeIndex: emoji.index - lineStart
        }))

        // Calculate line width including emojis
        let totalWidth = 0
        let currentPos = 0
        let lineText = line

        // Pre-calculate total width with emoji replacements
        for (const emoji of adjustedEmojis) {
            const textBefore = lineText.substring(currentPos, emoji.relativeIndex)
            totalWidth += ctx.measureText(textBefore).width + fontSize
            currentPos = emoji.relativeIndex + emoji.length
        }
        totalWidth += ctx.measureText(lineText.substring(currentPos)).width

        // Center alignment calculations
        const centerX = width / 2
        let currentX = centerX - totalWidth / 2

        // Draw AC7 opening arrows if needed
        if (style === 'ac7' && i === 0) {
            ctx.fillStyle = gradient === 'none' ? speakerColor : (stretchGradient ? gradientColors[0] : gradientColors[0])
            ctx.fillText('<<', currentX - 40, y)
            ctx.fillStyle = 'white'
        }

        // Reset for actual drawing
        currentPos = 0
        for (const emoji of adjustedEmojis) {
            const textBefore = lineText.substring(currentPos, emoji.relativeIndex)
            if (textBefore) {
                const textWidth = ctx.measureText(textBefore).width
                ctx.fillText(textBefore, currentX + textWidth/2, y)
                currentX += textWidth
            }

            // Find and draw the loaded emoji image
            const loadedEmoji = emojiImages.find(e => e.id === emoji.id)
            if (loadedEmoji) {
                ctx.drawImage(loadedEmoji.image, currentX, y + (fontSize * 0.1), fontSize, fontSize)
            }
            currentX += fontSize
            currentPos = emoji.relativeIndex + emoji.length
        }

        // Draw remaining text
        const remainingText = lineText.substring(currentPos)
        if (remainingText) {
            const textWidth = ctx.measureText(remainingText).width
            ctx.fillText(remainingText, currentX + textWidth/2, y)
            currentX += textWidth
        }

        // Draw AC7 closing arrows if needed
        if (style === 'ac7' && i === quoteLines.length - 1) {
            ctx.fillStyle = gradient === 'none' ? speakerColor : (stretchGradient ? gradientColors[gradientColors.length - 1] : gradientColors[0])
            ctx.fillText('>>', currentX + 40, y)
        }

        y += lineHeight
    }

    return canvas.toBuffer()
}

export const randRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
export const randArr = <T>(array: T[]) => array[Math.floor(Math.random() * array.length)]
export const hexStringToNumber = (hex: string) => parseInt(hex.replace('#', ''), 16)
export const getr = async (url: string) => {
    const res = await fetch(url)
    const json = await res.json()
    return json
}
export const appendDateAndTime = (message: string) => {
    const date = new Date()
    return `<${date.toUTCString()}>\n${message}` as const
}

export function extractUserId(userIdResolvable: UserIdResolvable) {
    let id = ''
    if (typeof userIdResolvable === 'string') id = userIdResolvable
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
    let buffer = Buffer.from(string, 'utf-8')
    return new AttachmentBuilder(buffer).setName(filename)
}
export function pluralize(count: number, singular: string, few: string, many: string) {
    if (count === 1) return singular
    if (count > 1 && count < 5) return few
    return many
}

export const boolToEmoji = (bool: boolean) => bool ? '✅' : '❌'
