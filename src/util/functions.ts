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

    // Word wrap speaker name
    const speakerWords = speaker.split(' ')
    const speakerLines: string[] = []
    let currentLine = speakerWords[0]

    for (let i = 1; i < speakerWords.length; i++) {
        const word = speakerWords[i]
        const testLine = currentLine + ' ' + word
        const metrics = measureCtx.measureText(testLine)

        if (metrics.width > maxWidth) {
            speakerLines.push(currentLine)
            currentLine = word
        } else currentLine = testLine
    }
    speakerLines.push(currentLine)

    // Helper function to detect and parse Discord emoji
    const parseEmojis = (text: string) => {
        const emojiRegex = /<:([^:]+):(\d+)>/g
        const matches = [...text.matchAll(emojiRegex)]
        return matches.map(match => ({
            full: match[0],
            name: match[1],
            id: match[2],
            index: match.index!,
            length: match[0].length,
            url: `https://cdn.discordapp.com/emojis/${match[2]}.png?size=48`
        }))
    }

    // Pre-load all emojis
    const emojis = parseEmojis(quote)
    const emojiImages = await Promise.all(
        emojis.map(async emoji => ({
            ...emoji,
            image: await loadImage(emoji.url)
        }))
    )

    // Word wrap quote with emoji preservation
    const quoteLines: string[] = []
    let lineStartIndices: number[] = []
    let currentIndex = 0
    const textLines = quote.split('\n')
    
    for (const textLine of textLines) {
        const words = textLine.split(' ')
        let currentLine = words[0]
        let lineStart = currentIndex
        currentIndex += currentLine.length

        for (let i = 1; i < words.length; i++) {
            const word = words[i]
            const testLine = currentLine + ' ' + word
            const metrics = measureCtx.measureText(testLine)
            const testLineEmojis = emojis.filter(e => 
                e.index >= lineStart && 
                e.index < lineStart + testLine.length
            )
            const emojiWidth = testLineEmojis.length * fontSize

            if (metrics.width + emojiWidth > maxWidth) {
                quoteLines.push(currentLine)
                lineStartIndices.push(lineStart)
                currentLine = word
                lineStart = currentIndex + 1 // +1 for space
                currentIndex = lineStart + word.length
            } else {
                currentLine = testLine
                currentIndex = lineStart + testLine.length
            }
        }
        quoteLines.push(currentLine)
        lineStartIndices.push(lineStart)
        currentIndex += 1 // for newline
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
        for (const line of speakerLines) {
            ctx.fillText(line, width / 2, y)
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
        
        const lineEmojis = emojis.filter(e => 
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
