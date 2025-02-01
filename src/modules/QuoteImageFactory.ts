import { createCanvas, loadImage, registerFont } from 'canvas'
import { Logger } from '../util/logger'
import { Buffer } from 'buffer'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TRANS_COLORS, RAINBOW_COLORS, ITALIAN_COLORS, type GradientType } from '../util/colors'
import { type Client, type Guild } from 'discord.js'

const logger = Logger.new('QuoteImageFactory')

export type QuoteImageResult = {
    buffer: Buffer,
    type: 'image/gif' | 'image/png'
}

export type QuoteStyle = 'pw' | 'ac7'

export class QuoteImageFactory {
    private static instance: QuoteImageFactory
    private client: Client | null = null
    private guild: Guild | null = null
    private usernames: Map<string, string>

    private constructor() {
        this.usernames = new Map()
    }

    public setUsernames(userMap: Record<string, string>) {
        this.usernames = new Map(Object.entries(userMap))
    }

    public setClient(client: Client) {
        this.client = client
    }

    public setGuild(guild: Guild) {
        this.guild = guild
    }

    private async fetchUsername(id: string): Promise<string> {
        if (!this.client) return id
        try {
            if (this.guild) {
                // Try to get member from guild first
                const member = await this.guild.members.fetch(id)
                if (member) {
                    return member.displayName
                }
            }
            // Fall back to global username if not found in guild
            const user = await this.client.users.fetch(id)
            return user.displayName
        } catch (error) {
            logger.error(`Failed to fetch username for ID ${id}: ${error}`)
            return id
        }
    }

    static getInstance(): QuoteImageFactory {
        if (!QuoteImageFactory.instance) {
            QuoteImageFactory.instance = new QuoteImageFactory()
        }
        return QuoteImageFactory.instance
    }

    private toCodePoint(unicodeSurrogates: string): string {
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

    private async createTempDir(): Promise<string> {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quote-'))
        return tmpDir
    }

    private async cleanupTempDir(dir: string): Promise<void> {
        try {
            await fs.rm(dir, { recursive: true, force: true })
        } catch (error) {
            logger.error(`Failed to cleanup temp dir: ${error}`)
        }
    }

    private async ffmpegCreateGif(framesDir: string, outputPath: string, fps: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-framerate', fps.toString(),
                '-i', path.join(framesDir, 'frame-%d.png'),
                '-filter_complex', '[0:v] split [a][b];[a] palettegen=reserve_transparent=on:transparency_color=000000 [p];[b][p] paletteuse',
                '-y',
                outputPath
            ])
            let stderr = ''
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString()
            })
            ffmpeg.on('close', async (code) => {
                if (code === 0) {
                    try {
                        const buffer = await fs.readFile(outputPath)
                        resolve(buffer)
                    } catch (error) {
                        reject(new Error(`Failed to read output file: ${error}`))
                    }
                } else {
                    reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`))
                }
            })
            ffmpeg.on('error', (error) => {
                reject(new Error(`Failed to start FFmpeg: ${error}`))
            })
        })
    }

    private async ffmpegExtractFrames(gifUrl: string, outputDir: string): Promise<{
        frames: string[]
        delays: number[]
        framerate: number
    }> {
        return new Promise(async (resolve, reject) => {
            // Download GIF to temp file
            const response = await fetch(gifUrl)
            const buffer = Buffer.from(await response.arrayBuffer())
            const gifPath = path.join(outputDir, 'temp.gif')
            await fs.writeFile(gifPath, new Uint8Array(buffer))

            // Extract frame information
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=nb_frames',
                '-of', 'default=nokey=1:noprint_wrappers=1',
                gifPath
            ])

            let frameCount = ''
            ffprobe.stdout.on('data', data => {
                frameCount += data.toString()
            })

            await new Promise((resolve) => ffprobe.on('close', resolve))

            // Get frame durations using ffprobe
            const ffprobeDurations = spawn('ffprobe', [
                '-v', 'quiet',
                '-select_streams', 'v:0',
                '-show_entries', 'frame=pkt_duration_time',
                '-of', 'csv=p=0',
                gifPath
            ])

            let durationsStr = ''
            ffprobeDurations.stdout.on('data', data => {
                durationsStr += data.toString()
            })

            await new Promise((resolve) => ffprobeDurations.on('close', resolve))
            const durations = durationsStr.trim().split('\n').map(Number)
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
            const framerate = Math.round(1 / avgDuration)

            // Extract frames and their timestamps
            const ffmpeg = spawn('ffmpeg', [
                '-i', gifPath,
                '-vsync', '0',
                '-frame_pts', '1',
                path.join(outputDir, 'frame-%d.png')
            ])

            let stderr = ''
            ffmpeg.stderr.on('data', data => {
                stderr += data.toString()
            })

            ffmpeg.on('close', async (code) => {
                if (code === 0) {
                    const frames = []
                    const delays = durations.map(d => d * 1000) // Convert to milliseconds
                    const frameFiles = await fs.readdir(outputDir)
                    const pngFiles = frameFiles.filter(f => f.startsWith('frame-') && f.endsWith('.png'))
                    
                    for (const file of pngFiles.sort((a, b) => {
                        const numA = parseInt(a.match(/frame-(\d+)\.png/)?.[1] || '0')
                        const numB = parseInt(b.match(/frame-(\d+)\.png/)?.[1] || '0')
                        return numA - numB
                    })) {
                        frames.push(path.join(outputDir, file))
                        // Assuming default 100ms delay between frames
                        delays.push(100)
                    }

                    resolve({ frames, delays, framerate })
                } else {
                    reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`))
                }
            })
        })
    }

    public async createQuoteImage(
        speaker: string,
        quote: string,
        color: string | null,
        gradient: GradientType,
        stretchGradient = false,
        style: QuoteStyle = 'pw'
    ): Promise<QuoteImageResult> {
        logger.info(`Creating quote image with params:\n${speaker}\n${quote}\n${color}\n${gradient}\n${stretchGradient}\n${style}`)

        const fontSize = 48
        const lineHeight = fontSize * 1.2
        const padding = 40
        const minWidth = 1024
        const maxWidth = 2048
        const font = style === 'pw' ? 'Roboto' : 'Aces07'
        const arrowQuoteWidth = style === 'ac7' ? 80 : 0 // Width for << and >> in AC7 style

        // Create canvas for measurements
        const measureCanvas = createCanvas(1, 1)
        const measureCtx = measureCanvas.getContext('2d')
        measureCtx.font = `${fontSize}px ${font}`

        // Updated helper function to detect and parse both Discord and Unicode emoji
        const parseEmojis = (text: string) => {
            logger.info(`Parsing emojis from text of length ${text.length}`)
            const results: Array<{
                full: string
                id?: string
                name?: string
                index: number
                length: number
                url?: string
                animated?: boolean
                type?: 'ping'
            }> = []

            // Parse pings
            const pingRegex = /<@!?(\d+)>/g
            const pingMatches = [...text.matchAll(pingRegex)]
            results.push(...pingMatches.map(match => ({
                full: match[0],
                id: match[1],
                index: match.index!,
                length: match[0].length,
                type: 'ping' as const
            })))

            // Parse custom Discord emojis (both static and animated)
            const customEmojiRegex = /<(a)?:([^:]+):(\d+)>/g
            const customMatches = [...text.matchAll(customEmojiRegex)]
            results.push(...customMatches.map(match => ({
                full: match[0],
                name: match[2],
                id: match[3],
                index: match.index!,
                length: match[0].length,
                url: `https://cdn.discordapp.com/emojis/${match[3]}.${match[1] ? 'gif' : 'png'}?size=48`,
                animated: !!match[1]
            })))

            // Parse Unicode emojis with better handling of flags and combined emojis
            const unicodeEmojiRegex = /(?:\p{RI}\p{RI})|(?:[\u{1F3F3}\u{1F3F4}](?:\u{FE0F}\u{200D}[\u{1F308}\u{2620}]|\u{E0067}\u{E0062}(?:\u{E0077}\u{E006C}\u{E0073}|\u{E0073}\u{E0063}\u{E0074}|\u{E0065}\u{E006E}\u{E0067})\u{E007F})?|(?:[\u{1F300}-\u{1F9FF}]|[\u{1F000}-\u{1FFFF}][\u{FE00}-\u{FE0F}]?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D(?:[\u{1F300}-\u{1F9FF}]|[\u{1F000}-\u{1FFFF}][\u{FE00}-\u{FE0F}]?(?:[\u{1F3FB}-\u{1F3FF}])?)*|\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}])?))/gu;

            const unicodeMatches = [...text.matchAll(unicodeEmojiRegex)]

            results.push(...unicodeMatches.map(match => ({
                full: match[0],
                index: match.index!,
                length: match[0].length,
                url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${this.toCodePoint(match[0])}.png`
            })))

            logger.info(`Found ${results.length} emojis/pings: ${results.map(e => e.full).join(', ')}`)
            return results
        }

        // Get all ping IDs and fetch usernames
        const allPings = [...parseEmojis(speaker), ...parseEmojis(quote)]
            .filter(e => e.type === 'ping')
            .map(e => e.id!)

        const usernames = new Map(
            await Promise.all(
                [...new Set(allPings)].map(async id => 
                    [id, await this.fetchUsername(id)] as [string, string]
                )
            )
        )
        this.usernames = usernames

        try {
            // Pre-load all emojis and detect if any are animated
            const speakerEmojis = parseEmojis(speaker)
            const quoteEmojis = parseEmojis(quote)
            const allEmojis = [...speakerEmojis, ...quoteEmojis]

            const hasAnimatedEmojis = allEmojis.some(e => e.animated)
            logger.info(`Animation status: ${hasAnimatedEmojis ? 'Animated' : 'Static'}`)

            // Load emoji frames
            logger.info('Loading emoji images...')
            const emojiImages = await Promise.all(
                allEmojis.map(async (emoji, index) => {
                    try {
                        if (emoji.animated) {
                            logger.info(`Loading animated emoji ${index + 1}/${allEmojis.length}: ${emoji.name || emoji.id}`)
                            const tmpDir = await this.createTempDir()
                            try {
                                if (emoji.url) {
                                    const { frames, delays, framerate } = await this.ffmpegExtractFrames(emoji.url, tmpDir)
                                    const loadedFrames = await Promise.all(frames.map(f => loadImage(f)))
                                    return {
                                        ...emoji,
                                        frames: loadedFrames,
                                        frameDelays: delays,
                                        framerate
                                    }
                                } else {
                                    throw new Error(`Emoji URL is undefined for emoji: ${emoji.name || emoji.id}`)
                                }
                            } finally {
                                await this.cleanupTempDir(tmpDir)
                            }
                        } else {
                            logger.info(`Loading static emoji ${index + 1}/${allEmojis.length}`)
                            return {
                                ...emoji,
                                image: emoji.url ? await loadImage(emoji.url) : null
                            }
                        }
                    } catch (error) {
                        logger.error(`Failed to load emoji: ${emoji.name || emoji.id}\n${error}\n${emoji.url}`)
                        return { ...emoji, image: null }
                    }
                })
            )
            logger.info('Finished loading emoji images')

            const measureWordWidth = (word: string, startIndex: number, emojis: ReturnType<typeof parseEmojis>) => {
                let width = measureCtx.measureText(word).width
                const wordEmojis = emojis.filter(e => 
                    e.index >= startIndex && 
                    e.index < startIndex + word.length
                )
                for (const emoji of wordEmojis) {
                    width -= measureCtx.measureText(emoji.full).width
                    if (emoji.type === 'ping') {
                        const username = this.usernames.get(emoji.id!) || emoji.full
                        width += measureCtx.measureText('@' + username).width
                    } else {
                        width += fontSize
                    }
                }
                return width
            }

            // Calculate optimal width based on speaker and quote content
            const calculateRequiredWidth = (text: string, emojis: ReturnType<typeof parseEmojis>) => {
                let maxLineWidth = 0
                const lines = text.split('\n')
                let currentIndex = 0

                for (const line of lines) {
                    let lineWidth = 0
                    const lineEmojis = emojis.filter(e => 
                        e.index >= currentIndex && 
                        e.index < currentIndex + line.length
                    )

                    const words = line.split(' ')
                    for (const word of words) {
                        lineWidth += measureWordWidth(word, currentIndex, emojis) + 
                            (lineWidth > 0 ? measureCtx.measureText(' ').width : 0)
                    }

                    maxLineWidth = Math.max(maxLineWidth, lineWidth)
                    currentIndex += line.length + 1
                }
                return maxLineWidth + padding * 2 + arrowQuoteWidth
            }

            const speakerWidth = calculateRequiredWidth(speaker, speakerEmojis)
            const quoteWidth = calculateRequiredWidth(quote, quoteEmojis)
            const requiredWidth = Math.max(speakerWidth, quoteWidth)
            const width = Math.min(Math.max(minWidth, requiredWidth), maxWidth)
            const effectiveMaxWidth = width - padding * 2 - arrowQuoteWidth

            // Word wrap speaker name with long word handling
            const speakerLines: string[] = []
            let speakerStartIndices: number[] = []
            let currentIndex = 0
            const speakerTextLines = speaker.split('\n')

            for (const textLine of speakerTextLines) {
                const words = textLine.split(' ')
                for (let i = 0; i < words.length; i++) {
                    const word = words[i]
                    const wordWidth = measureWordWidth(word, currentIndex, speakerEmojis)

                    if (wordWidth > effectiveMaxWidth) {
                        // Split long word into chunks
                        let remainingWord = word
                        let remainingIndex = currentIndex

                        while (remainingWord.length > 0) {
                            let chunkLength = remainingWord.length
                            while (chunkLength > 0 && measureWordWidth(remainingWord.slice(0, chunkLength), remainingIndex, speakerEmojis) > effectiveMaxWidth) {
                                chunkLength--
                            }

                            // If we couldn't fit even one character, force at least one
                            if (chunkLength === 0) chunkLength = 1

                            const chunk = remainingWord.slice(0, chunkLength)
                            speakerLines.push(chunk)
                            speakerStartIndices.push(remainingIndex)

                            remainingWord = remainingWord.slice(chunkLength)
                            remainingIndex += chunkLength
                        }
                        currentIndex += word.length + 1
                    } else {
                        // Normal word handling
                        const isFirstWord = i === 0
                        const testLine = isFirstWord ? word : speakerLines[speakerLines.length - 1] + ' ' + word
                        const testWidth = isFirstWord ? wordWidth : measureWordWidth(testLine, speakerStartIndices[speakerStartIndices.length - 1], speakerEmojis)

                        if (!isFirstWord && testWidth <= effectiveMaxWidth) {
                            speakerLines[speakerLines.length - 1] = testLine
                        } else {
                            speakerLines.push(word)
                            speakerStartIndices.push(currentIndex)
                        }
                        currentIndex += word.length + 1
                    }
                }
            }

            // Word wrap quote with emoji preservation and long word handling
            const quoteLines: string[] = []
            let lineStartIndices: number[] = []
            currentIndex = 0
            const textLines = quote.split('\n')

            for (const textLine of textLines) {
                const words = textLine.split(' ')
                for (let i = 0; i < words.length; i++) {
                    const word = words[i]
                    const wordWidth = measureWordWidth(word, currentIndex, quoteEmojis)

                    if (wordWidth > effectiveMaxWidth) {
                        // Split long word into chunks, first try splitting at slashes
                        const slashParts = word.split('/')
                        if (slashParts.length > 1) {
                            // Handle each part as a separate word
                            for (const part of slashParts) {
                                if (part) { // Skip empty parts
                                    const partWidth = measureWordWidth(part, currentIndex, quoteEmojis)
                                    if (partWidth > effectiveMaxWidth) {
                                        // If part is still too long, do character-by-character splitting
                                        let remainingWord = part
                                        let remainingIndex = currentIndex

                                        while (remainingWord.length > 0) {
                                            let chunkLength = remainingWord.length
                                            while (chunkLength > 0 && measureWordWidth(remainingWord.slice(0, chunkLength), remainingIndex, quoteEmojis) > effectiveMaxWidth) {
                                                chunkLength--
                                            }

                                            if (chunkLength === 0) chunkLength = 1

                                            const chunk = remainingWord.slice(0, chunkLength)
                                            quoteLines.push(chunk)
                                            lineStartIndices.push(remainingIndex)

                                            remainingWord = remainingWord.slice(chunkLength)
                                            remainingIndex += chunkLength
                                        }
                                    } else {
                                        quoteLines.push(part)
                                        lineStartIndices.push(currentIndex)
                                    }
                                    currentIndex += part.length + 1
                                }

                                // Add slash back except for last part
                                if (part !== slashParts[slashParts.length - 1]) {
                                    quoteLines[quoteLines.length - 1] += '/'
                                }
                            }
                        } else {
                            // No slashes, fall back to character-by-character splitting
                            let remainingWord = word
                            let remainingIndex = currentIndex

                            while (remainingWord.length > 0) {
                                let chunkLength = remainingWord.length
                                while (chunkLength > 0 && measureWordWidth(remainingWord.slice(0, chunkLength), remainingIndex, quoteEmojis) > effectiveMaxWidth) {
                                    chunkLength--
                                }

                                if (chunkLength === 0) chunkLength = 1

                                const chunk = remainingWord.slice(0, chunkLength)
                                quoteLines.push(chunk)
                                lineStartIndices.push(remainingIndex)

                                remainingWord = remainingWord.slice(chunkLength)
                                remainingIndex += chunkLength
                            }
                            currentIndex += word.length + 1
                        }
                    } else {
                        // Normal word handling
                        const isFirstWord = i === 0
                        const testLine = isFirstWord ? word : quoteLines[quoteLines.length - 1] + ' ' + word
                        const testWidth = isFirstWord ? wordWidth : measureWordWidth(testLine, lineStartIndices[lineStartIndices.length - 1], quoteEmojis)

                        if (!isFirstWord && testWidth <= effectiveMaxWidth) {
                            quoteLines[quoteLines.length - 1] = testLine
                        } else {
                            quoteLines.push(word)
                            lineStartIndices.push(currentIndex)
                        }
                        currentIndex += word.length + 1
                    }
                }
            }

            // Calculate height based on number of lines
            const speakerHeight = speakerLines.length * lineHeight
            const height = 50 + speakerHeight + 2 + (quoteLines.length * lineHeight) + padding

            const renderFrame = async (frameIndex: number) => {
                logger.info(`Rendering frame ${frameIndex + 1}`)
                const startTime = performance.now()

                // Create canvas and context for this frame
                const canvas = createCanvas(width, height)
                const ctx = canvas.getContext('2d')

                // Define drawEmoji at the start of renderFrame so it's available everywhere
                const drawEmoji = (emoji: typeof emojiImages[0], x: number, y: number) => {
                    if ('frames' in emoji && emoji.frames) {
                        const frame = emoji.frames[frameIndex % emoji.frames.length]
                        ctx.drawImage(frame, x, y + (fontSize * 0.1), fontSize, fontSize)
                    } else if ('image' in emoji) {
                        ctx.drawImage(emoji.image!, x, y + (fontSize * 0.1), fontSize, fontSize)
                    }
                }

                const drawText = (text: string, x: number, y: number, isPing = false, pingId?: string) => {
                    if (isPing) {
                        // Save context state
                        ctx.save()

                        const username = this.usernames.get(pingId!) || text
                        text = '@' + username

                        // Draw background with lighter ping color
                        const textWidth = ctx.measureText(text).width
                        ctx.fillStyle = '#7289DA30' // Discord ping color with 30% opacity
                        const bgPadding = fontSize * 0.2
                        const bgHeight = fontSize * 1.1
                        const bgOffset = 10 // Offset background down by 10px
                        // Round the corners of the background
                        ctx.beginPath()
                        ctx.roundRect(
                            x - textWidth/2 - bgPadding,
                            y + bgOffset - bgPadding/2,
                            textWidth + bgPadding * 2,
                            bgHeight,
                            bgHeight/2
                        )
                        ctx.fill()

                        // Draw text
                        ctx.fillStyle = '#7289DA'
                        ctx.fillText(text, x, y)

                        // Restore context state
                        ctx.restore()
                    } else {
                        ctx.fillText(text, x, y)
                    }
                }

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
                                drawText(textBefore, currentX + textWidth/2, y)
                                currentX += textWidth
                            }

                            if (emoji.type === 'ping') {
                                const username = this.usernames.get(emoji.id!) || emoji.full
                                const pingWidth = ctx.measureText('@' + username).width
                                drawText(emoji.full, currentX + pingWidth/2, y, true, emoji.id)
                                currentX += pingWidth
                            } else {
                                // Existing emoji drawing code
                                const loadedEmoji = emojiImages.find(e => 
                                    (emoji.id && e.id === emoji.id) || 
                                    (!emoji.id && e.full === emoji.full)
                                )
                                if (loadedEmoji) {
                                    drawEmoji(loadedEmoji, currentX, y)
                                }
                                currentX += fontSize
                            }
                            currentPos = emoji.relativeIndex + emoji.length
                        }

                        const remainingText = lineText.substring(currentPos)
                        if (remainingText) {
                            const textWidth = ctx.measureText(remainingText).width
                            drawText(remainingText, currentX + textWidth/2, y)
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
                        if (emoji.type === 'ping') {
                            const username = this.usernames.get(emoji.id!) || emoji.full
                            totalWidth += ctx.measureText(textBefore).width
                            totalWidth += ctx.measureText('@' + username).width
                        } else {
                            totalWidth += ctx.measureText(textBefore).width + fontSize
                        }
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
                            drawText(textBefore, currentX + textWidth/2, y)
                            currentX += textWidth
                        }

                        if (emoji.type === 'ping') {
                            const username = this.usernames.get(emoji.id!) || emoji.full
                            const pingWidth = ctx.measureText('@' + username).width
                            drawText(emoji.full, currentX + pingWidth/2, y, true, emoji.id)
                            currentX += pingWidth
                        } else {
                            // Find and draw the loaded emoji image
                            const loadedEmoji = emojiImages.find(e => 
                                // For Discord emojis, match by ID
                                (emoji.id && e.id === emoji.id) || 
                                // For Twemojis, match by full text
                                (!emoji.id && e.full === emoji.full)
                            )
                            if (loadedEmoji) {
                                drawEmoji(loadedEmoji, currentX, y)
                            }
                            currentX += fontSize
                        }
                        currentPos = emoji.relativeIndex + emoji.length
                    }

                    // Draw remaining text
                    const remainingText = lineText.substring(currentPos)
                    if (remainingText) {
                        const textWidth = ctx.measureText(remainingText).width
                        drawText(remainingText, currentX + textWidth/2, y)
                        currentX += textWidth
                    }

                    // Draw AC7 closing arrows if needed
                    if (style === 'ac7' && i === quoteLines.length - 1) {
                        ctx.fillStyle = gradient === 'none' ? speakerColor : (stretchGradient ? gradientColors[gradientColors.length - 1] : gradientColors[0])
                        ctx.fillText('>>', currentX + 40, y)
                    }

                    y += lineHeight
                }

                const endTime = performance.now()
                logger.info(`Frame ${frameIndex + 1} rendered in ${(endTime - startTime).toFixed(2)}ms`)
                return canvas
            }

            if (hasAnimatedEmojis) {
                // Find all unique animated emojis
                const animatedEmojis = emojiImages.filter(e => 'frames' in e)
                const uniqueAnimatedIds = new Set(animatedEmojis.map(e => e.id))

                // If there's only one unique animated emoji, use its framerate
                let targetFramerate = 20 // default
                if (uniqueAnimatedIds.size === 1) {
                    const firstAnimatedEmoji = animatedEmojis[0] as any
                    targetFramerate = firstAnimatedEmoji.frameDelays ? 
                        Math.round(1000 / firstAnimatedEmoji.frameDelays[0]) : 20
                }

                const maxFrames = Math.max(...animatedEmojis.map(e => (e as any).frames.length))
                logger.info(`Creating animated image with ${maxFrames} frames at ${targetFramerate}fps`)

                const tmpDir = await this.createTempDir()
                const outputPath = path.join(tmpDir, 'output.gif')

                try {
                    // Render frames to PNG files
                    for (let i = 0; i < maxFrames; i++) {
                        const canvas = await renderFrame(i)
                        const framePath = path.join(tmpDir, `frame-${i + 1}.png`)
                        await fs.writeFile(framePath, new Uint8Array(canvas.toBuffer()))

                        if (i % 10 === 0) {
                            const progress = ((i + 1) / maxFrames * 100).toFixed(1)
                            logger.info(`Frame progress: ${progress}% (${i + 1}/${maxFrames})`)
                        }
                    }

                    // Create GIF using FFmpeg with detected framerate
                    logger.info(`Creating GIF with FFmpeg at ${targetFramerate}fps...`)
                    const buffer = await this.ffmpegCreateGif(tmpDir, outputPath, targetFramerate)
                    logger.info(`GIF generation complete. Final size: ${(buffer.length / 1024).toFixed(2)}KB`)

                    return {
                        buffer,
                        type: 'image/gif'
                    }
                } finally {
                    await this.cleanupTempDir(tmpDir)
                }
            } else {
                logger.info('Generating static image')
                const canvas = await renderFrame(0)
                return {
                    buffer: canvas.toBuffer(),
                    type: 'image/png'
                }
            }
        } catch (error) {
            logger.error('Error creating quote image: ' + error)
            throw error
        }
    }
}
