import 'reflect-metadata'
import { parentPort, isMainThread } from 'worker_threads'
import type { ExplicitAny } from '../../types'

import {
    createCanvas,
    loadImage,
    registerFont,
    type Canvas,
    type CanvasRenderingContext2D as _CanvasRenderingContext2D
} from 'canvas'
import { Buffer } from 'buffer'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
    type SubtitleGradientType,
    SUBTITLE_GRADIENTS
} from '../../util/colors'
import { Logger } from '../Logger'
import { red, yellow } from '../../util/colors'

if (isMainThread) {
    throw new Error(
        'This file is a worker and should not be run on the main thread.'
    )
}

const logger = new Logger('SubtitleGenerator | Worker')

registerFont(path.join(__dirname, '../../../data/Roboto.ttf'), {
    family: 'Roboto'
})
registerFont(path.join(__dirname, '../../../data/Aces07.ttf'), {
    family: 'Aces07'
})
registerFont(path.join(__dirname, '../../../data/Frutiger.ttf'), {
    family: 'Frutiger'
})
registerFont(path.join(__dirname, '../../../data/FSSinclairRegular.otf'), {
    family: 'FSSinclair'
})

type SubtitleStyle = 'pw' | 'ac7' | 'acz' | 'hd2'

interface SubtitleOptions {
    speaker: string
    quote: string
    color: string | null
    gradient: SubtitleGradientType
    stretchGradient: boolean
    style: SubtitleStyle
    interpretNewlines: boolean
    continuousGradient: boolean
    usernames: Record<string, string>
}

function toCodePoint(unicodeSurrogates: string): string {
    const r = []
    let c: number,
        p = 0,
        i = 0
    while (i < unicodeSurrogates.length) {
        c = unicodeSurrogates.charCodeAt(i++)
        if (p) {
            r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16))
            p = 0
        } else if (0xd800 <= c && c <= 0xdbff) {
            p = c
        } else {
            r.push(c.toString(16))
        }
    }
    return r.join('-')
}

async function createTempDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'subtitle-'))
}

async function cleanupTempDir(dir: string): Promise<void> {
    try {
        await fs.rm(dir, { recursive: true, force: true })
    } catch (e) {
        logger.error(`Failed to cleanup temp dir: ${red((e as Error).message)}`)
    }
}

async function ffmpegCreateGif(
    framesDir: string,
    outputPath: string,
    fps: number
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-framerate',
            fps.toString(),
            '-i',
            path.join(framesDir, 'frame-%d.png'),
            '-filter_complex',
            '[0:v] split [a][b];[a] palettegen=reserve_transparent=on:transparency_color=000000 [p];[b][p] paletteuse',
            '-y',
            outputPath
        ])
        let stderr = ''
        ffmpeg.stderr.on('data', (data: ExplicitAny) => {
            stderr += data.toString()
        })
        ffmpeg.on('close', async (code: ExplicitAny) => {
            if (code === 0) {
                try {
                    resolve(await fs.readFile(outputPath))
                } catch (error) {
                    reject(new Error(`Failed to read output file: ${error}`))
                }
            } else {
                reject(new Error(`FFmpeg failed with code ${code}:\n${stderr}`))
            }
        })
        ffmpeg.on('error', (error: ExplicitAny) =>
            reject(new Error(`Failed to start FFmpeg: ${error}.`))
        )
    })
}

async function ffmpegExtractFrames(
    gifUrl: string,
    outputDir: string
): Promise<{
    frames: string[]
    delays: number[]
    framerate: number
}> {
    return new Promise(async (resolve, reject) => {
        const response = await fetch(gifUrl)
        const buffer = Buffer.from(await response.arrayBuffer())
        const gifPath = path.join(outputDir, 'temp.gif')
        await fs.writeFile(gifPath, new Uint8Array(buffer))

        const ffprobeDurations = spawn('ffprobe', [
            '-v',
            'quiet',
            '-select_streams',
            'v:0',
            '-show_entries',
            'frame=pkt_duration_time',
            '-of',
            'csv=p=0',
            gifPath
        ])
        let durationsStr = ''
        ffprobeDurations.stdout.on('data', (data: ExplicitAny) => {
            durationsStr += data.toString()
        })
        await new Promise(resolve => ffprobeDurations.on('close', resolve))
        const durations = durationsStr.trim().split('\n').map(Number)
        const avgDuration =
            durations.reduce((a, b) => a + b, 0) / durations.length
        const framerate = Math.round(1 / avgDuration)

        const ffmpeg = spawn('ffmpeg', [
            '-i',
            gifPath,
            '-vsync',
            '0',
            '-frame_pts',
            '1',
            path.join(outputDir, 'frame-%d.png')
        ])
        let stderr = ''
        ffmpeg.stderr.on('data', (data: ExplicitAny) => {
            stderr += data.toString()
        })
        ffmpeg.on('close', async (code: ExplicitAny) => {
            if (code === 0) {
                const files = await fs.readdir(outputDir)
                const frameFiles = files
                    .filter(f => f.startsWith('frame-') && f.endsWith('.png'))
                    .sort(
                        (a, b) =>
                            parseInt(a.match(/(\d+)/)?.[0] || '0') -
                            parseInt(b.match(/(\d+)/)?.[0] || '0')
                    )
                resolve({
                    frames: frameFiles.map(f => path.join(outputDir, f)),
                    delays: durations.map(d => d * 1000),
                    framerate
                })
            } else {
                reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`))
            }
        })
    })
}

async function performGeneration(options: SubtitleOptions) {
    let {
        speaker,
        quote
    } = options
    const {
        color,
        gradient,
        stretchGradient,
        style,
        interpretNewlines,
        continuousGradient,
        usernames
    } = options

    if (interpretNewlines) {
        speaker = speaker.replace(/<newline>/g, '\n')
        quote = quote.replace(/<newline>/g, '\n')
    }

    const fontSize = 48
    const lineHeight = fontSize * 1.2
    const padding = 40
    const minWidth = 1024
    const maxWidth = 2048
    const font =
        style === 'pw'
            ? 'Roboto'
            : style === 'ac7'
              ? 'Aces07'
              : style === 'acz'
                ? 'Frutiger'
                : 'FSSinclair'
    const arrowQuoteWidth = style === 'ac7' || style === 'acz' ? 80 : 0

    const measureCanvas = createCanvas(1, 1)
    const measureCtx = measureCanvas.getContext('2d')
    measureCtx.font = `${style === 'hd2' ? 48 : fontSize}px ${font}`

    const parseEmojis = (text: string) => {
        logger.debug(
            `Parsing emojis from text of length ${yellow(text.length)}`
        )
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
        const pingRegex = /<@!?(\d+)>/g
        results.push(
            ...[...text.matchAll(pingRegex)].map(match => ({
                full: match[0],
                id: match[1],
                index: match.index!,
                length: match[0].length,
                type: 'ping' as const
            }))
        )
        const customEmojiRegex = /<(a)?:([^:]+):(\d+)>/g
        results.push(
            ...[...text.matchAll(customEmojiRegex)].map(match => ({
                full: match[0],
                name: match[2],
                id: match[3],
                index: match.index!,
                length: match[0].length,
                url: `https://cdn.discordapp.com/emojis/${match[3]}.${match[1] ? 'gif' : 'png'}?size=48`,
                animated: !!match[1]
            }))
        )
        const unicodeEmojiRegex =
            /(?:\p{RI}\p{RI})|(?:[\u{1F3F3}\u{1F3F4}](?:\u{FE0F}\u{200D}[\u{1F308}\u{2620}]|\u{E0067}\u{E0062}(?:\u{E0077}\u{E006C}\u{E0073}|\u{E0073}\u{E0063}\u{E0074}|\u{E0065}\u{E006E}\u{E0067})\u{E007F})?|(?:[\u{1F300}-\u{1F9FF}]|[\u{1F000}-\u{1FFFF}][\u{FE00}-\u{FE0F}]?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D(?:[\u{1F300}-\u{1F9FF}]|[\u{1F000}-\u{1FFFF}][\u{FE00}-\u{FE0F}]?(?:[\u{1F3FB}-\u{1F3FF}])?)*|\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}])?))/gu
        results.push(
            ...[...text.matchAll(unicodeEmojiRegex)].map(match => ({
                full: match[0],
                index: match.index!,
                length: match[0].length,
                url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${toCodePoint(match[0])}.png`
            }))
        )
        logger.debug(
            `Found ${yellow(results.length)} emojis/pings: ${yellow(results.map(e => e.full).join(', '))}`
        )
        return results
    }

    const speakerEmojis = parseEmojis(speaker)
    const quoteEmojis = parseEmojis(quote)
    const allEmojis = [...speakerEmojis, ...quoteEmojis]
    const hasAnimatedEmojis = allEmojis.some(e => e.animated)

    const emojiImages = await Promise.all(
        allEmojis.map(async (emoji, _index) => {
            try {
                if (emoji.animated) {
                    const tmpDir = await createTempDir()
                    try {
                        if (emoji.url) {
                            const { frames, delays, framerate } =
                                await ffmpegExtractFrames(emoji.url, tmpDir)
                            return {
                                ...emoji,
                                frames: await Promise.all(
                                    frames.map(f => loadImage(f))
                                ),
                                frameDelays: delays,
                                framerate
                            }
                        } else
                            throw new Error(
                                `Emoji URL is undefined for ${emoji.name || emoji.id}`
                            )
                    } finally {
                        await cleanupTempDir(tmpDir)
                    }
                } else {
                    return {
                        ...emoji,
                        image: emoji.url ? await loadImage(emoji.url) : null
                    }
                }
            } catch (e) {
                logger.error(
                    `Failed to load emoji ${yellow(emoji.name || emoji.id)}: ${red((e as Error).message)} (${yellow(emoji.url)})`
                )
                return { ...emoji, image: null }
            }
        })
    )

    const measureWordWidth = (
        word: string,
        startIndex: number,
        emojis: ReturnType<typeof parseEmojis>
    ) => {
        let width = measureCtx.measureText(word).width
        emojis
            .filter(
                e =>
                    e.index >= startIndex && e.index < startIndex + word.length
            )
            .forEach(emoji => {
                width -= measureCtx.measureText(emoji.full).width
                width +=
                    emoji.type === 'ping'
                        ? measureCtx.measureText(
                              '@' + (usernames[emoji.id!] || emoji.full)
                          ).width
                        : fontSize
            })
        return width
    }

    const calculateRequiredWidth = (
        text: string,
        emojis: ReturnType<typeof parseEmojis>
    ) => {
        let maxLineWidth = 0
        text.split('\n').forEach((line, lineIndex) => {
            let lineWidth = 0
            line.split(' ').forEach(word => {
                lineWidth +=
                    measureWordWidth(word, lineIndex, emojis) +
                    (lineWidth > 0 ? measureCtx.measureText(' ').width : 0)
            })
            maxLineWidth = Math.max(maxLineWidth, lineWidth)
        })
        return maxLineWidth + padding * 2 + arrowQuoteWidth
    }

    const speakerWidth = calculateRequiredWidth(speaker, speakerEmojis)
    const quoteWidth = calculateRequiredWidth(quote, quoteEmojis)
    const requiredWidth = Math.max(speakerWidth, quoteWidth)
    const width = Math.min(Math.max(minWidth, requiredWidth), maxWidth)
    const effectiveMaxWidth = width - padding * 2 - arrowQuoteWidth

    const wrapText = (text: string, emojis: ReturnType<typeof parseEmojis>) => {
        const lines: string[] = []
        const startIndices: number[] = []
        let currentIndex = 0
        text.split('\n').forEach(textLine => {
            textLine.split(' ').forEach((word, i) => {
                const wordWidth = measureWordWidth(word, currentIndex, emojis)
                if (wordWidth > effectiveMaxWidth) {
                    let remainingWord = word,
                        remainingIndex = currentIndex
                    while (remainingWord.length > 0) {
                        let chunkLength = remainingWord.length
                        while (
                            chunkLength > 0 &&
                            measureWordWidth(
                                remainingWord.slice(0, chunkLength),
                                remainingIndex,
                                emojis
                            ) > effectiveMaxWidth
                        )
                            chunkLength--
                        if (chunkLength === 0) chunkLength = 1
                        const chunk = remainingWord.slice(0, chunkLength)
                        lines.push(chunk)
                        startIndices.push(remainingIndex)
                        remainingWord = remainingWord.slice(chunkLength)
                        remainingIndex += chunkLength
                    }
                    currentIndex += word.length + 1
                } else {
                    const isFirstWord = i === 0
                    const testLine = isFirstWord
                        ? word
                        : `${lines[lines.length - 1]} ${word}`
                    const testWidth = isFirstWord
                        ? wordWidth
                        : measureWordWidth(
                              testLine,
                              startIndices[startIndices.length - 1],
                              emojis
                          )
                    if (!isFirstWord && testWidth <= effectiveMaxWidth)
                        lines[lines.length - 1] = testLine
                    else {
                        lines.push(word)
                        startIndices.push(currentIndex)
                    }
                    currentIndex += word.length + 1
                }
            })
        })
        return { lines, startIndices }
    }

    const { lines: speakerLines, startIndices: speakerStartIndices } = wrapText(
        speaker,
        speakerEmojis
    )
    const { lines: quoteLines, startIndices: lineStartIndices } = wrapText(
        quote,
        quoteEmojis
    )

    const speakerHeight = speakerLines.length * lineHeight
    const height =
        50 + speakerHeight + 2 + quoteLines.length * lineHeight + padding

    const renderFrame = async (frameIndex: number): Promise<Canvas> => {
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        logger.debug(`Rendering frame ${yellow(frameIndex + 1)}`)
        const startTime = performance.now()

        // Create canvas and context for this frame
        const speakerLineWidths: number[] = []

        // HD2-specific measurements
        const hd2FontSize = Math.floor(canvas.width * 0.025) // Increased from 0.012 to make text larger
        const hd2LineHeight = hd2FontSize * 1.6 // Adjusted multiplier for better text spacing
        const hd2TextPadding = Math.floor(hd2FontSize * 1.2) // Padding relative to font size
        const hd2SpeakerTextGap = Math.floor(hd2FontSize * 0.75) // Reduced from 1.5 to 0.75 for tighter spacing
        const hd2BaselineOffset = Math.floor(hd2LineHeight * 0.65) // Adjusted for better vertical alignment

        // Define drawEmoji at the start of renderFrame so it's available everywhere
        const drawEmoji = (
            emoji: (typeof emojiImages)[0],
            x: number,
            y: number
        ) => {
            if ('frames' in emoji && emoji.frames) {
                const frame = emoji.frames[frameIndex % emoji.frames.length]
                ctx.drawImage(frame, x, y + fontSize * 0.1, fontSize, fontSize)
            } else if ('image' in emoji) {
                ctx.drawImage(
                    emoji.image!,
                    x,
                    y + fontSize * 0.1,
                    fontSize,
                    fontSize
                )
            }
        }

        const drawText = (
            text: string,
            x: number,
            y: number,
            isPing = false,
            pingId?: string
        ) => {
            if (isPing) {
                // Save context state
                ctx.save()

                const username = usernames[pingId!] || text
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
                    x - textWidth / 2 - bgPadding,
                    y + bgOffset - bgPadding / 2,
                    textWidth + bgPadding * 2,
                    bgHeight,
                    bgHeight / 2
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
        const { TRANS_COLORS, RAINBOW_COLORS, ITALIAN_COLORS, FRENCH_COLORS } =
            SUBTITLE_GRADIENTS
        const gradientColors =
            gradient === 'trans'
                ? TRANS_COLORS
                : gradient === 'rainbow'
                  ? RAINBOW_COLORS
                  : gradient === 'italian'
                    ? ITALIAN_COLORS
                    : FRENCH_COLORS

        ctx.clearRect(0, 0, width, height)
        ctx.font = `${fontSize}px ${font}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.shadowColor = 'black'
        ctx.shadowBlur = 8
        let y = 50

        // Helldivers 2 style, completely different from Ace Combat 7 and Project Wingman so handled separately
        if (style === 'hd2') {
            // Set up font and measurements
            ctx.font = `${hd2FontSize}px ${font}`
            ctx.textBaseline = 'alphabetic'
            ctx.textAlign = 'left'
            ctx.shadowBlur = 0 // Remove shadow effect

            // Calculate dimensions
            const speakerWidth = ctx.measureText(speaker).width
            const maxBoxWidth = width * 0.8 // Maximum allowed width

            // Word wrap the quote text
            const wrappedQuoteLines: string[] = []
            const words = quote.split(' ')
            let currentLine = ''

            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word
                const testWidth = ctx.measureText(testLine).width

                if (
                    testWidth >
                    maxBoxWidth -
                        speakerWidth -
                        hd2SpeakerTextGap -
                        hd2TextPadding * 2
                ) {
                    if (currentLine) {
                        wrappedQuoteLines.push(currentLine)
                        currentLine = word
                    } else {
                        // If a single word is too long, force it on its own line
                        wrappedQuoteLines.push(word)
                        currentLine = ''
                    }
                } else {
                    currentLine = testLine
                }
            }
            if (currentLine) {
                wrappedQuoteLines.push(currentLine)
            }

            // Calculate final box dimensions
            const maxTextWidth = Math.max(
                ...wrappedQuoteLines.map(line => ctx.measureText(line).width)
            )
            const totalWidth = Math.min(
                maxBoxWidth,
                speakerWidth +
                    hd2SpeakerTextGap +
                    maxTextWidth +
                    hd2TextPadding * 2
            )

            // Box height needs to account for multiple lines
            const boxHeight =
                hd2LineHeight *
                    (1.2 +
                        (wrappedQuoteLines.length > 1
                            ? 0.4 * (wrappedQuoteLines.length - 1)
                            : 0)) +
                (wrappedQuoteLines.length > 1
                    ? (wrappedQuoteLines.length - 1) * 10
                    : 0) // Add the extra line spacing to box height
            const boxWidth = totalWidth
            const boxX = (canvas.width - boxWidth) / 2
            const hd2VerticalOffset = canvas.height * 0.6
            const boxY = hd2VerticalOffset - boxHeight / 2

            // Black box
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
            ctx.fillRect(boxX, boxY, boxWidth, boxHeight)

            // Speaker name
            ctx.fillStyle = gradient === 'none' ? '#FFE81F' : speakerColor
            const speakerX = boxX + hd2TextPadding
            const speakerY = boxY + hd2BaselineOffset
            ctx.fillText(speaker, speakerX, speakerY)

            // Quote text
            ctx.fillStyle = 'white'
            const textX = speakerX + speakerWidth + hd2SpeakerTextGap
            let currentY = speakerY

            for (let i = 0; i < wrappedQuoteLines.length; i++) {
                const line = wrappedQuoteLines[i]
                ctx.fillText(line, textX, currentY)
                currentY += hd2LineHeight * 0.4 + 14 // Added 14 pixels to prevent tall letters from clipping
            }

            return canvas
        }

        if (gradient === 'none') {
            ctx.fillStyle = speakerColor
            for (let i = 0; i < speakerLines.length; i++) {
                const line = speakerLines[i]
                const lineStart = speakerStartIndices[i]
                const nextLineStart =
                    speakerStartIndices[i + 1] || speaker.length

                const lineEmojis = speakerEmojis
                    .filter(
                        e => e.index >= lineStart && e.index < nextLineStart
                    )
                    .sort((a, b) => a.index - b.index)

                const adjustedEmojis = lineEmojis.map(emoji => ({
                    ...emoji,
                    relativeIndex: emoji.index - lineStart
                }))

                // Calculate total width
                let totalWidth = 0
                let currentPos = 0
                const lineText = line
                for (const emoji of adjustedEmojis) {
                    const textBefore = lineText.substring(
                        currentPos,
                        emoji.relativeIndex
                    )
                    totalWidth += ctx.measureText(textBefore).width
                    if (emoji.type === 'ping') {
                        const username = usernames[emoji.id!] || emoji.full
                        totalWidth += ctx.measureText('@' + username).width
                    } else {
                        totalWidth += fontSize
                    }
                    currentPos = emoji.relativeIndex + emoji.length
                }
                totalWidth += ctx.measureText(
                    lineText.substring(currentPos)
                ).width
                speakerLineWidths.push(totalWidth)

                // Text and emojis
                const centerX = width / 2
                let currentX = centerX - totalWidth / 2
                currentPos = 0

                for (const emoji of adjustedEmojis) {
                    const textBefore = lineText.substring(
                        currentPos,
                        emoji.relativeIndex
                    )
                    if (textBefore) {
                        const textWidth = ctx.measureText(textBefore).width
                        drawText(textBefore, currentX + textWidth / 2, y)
                        currentX += textWidth
                    }

                    if (emoji.type === 'ping') {
                        const username = usernames[emoji.id!] || emoji.full
                        const pingWidth = ctx.measureText('@' + username).width
                        drawText(
                            emoji.full,
                            currentX + pingWidth / 2,
                            y,
                            true,
                            emoji.id
                        )
                        currentX += pingWidth
                    } else {
                        // Existing emoji drawing code
                        const loadedEmoji = emojiImages.find(
                            e =>
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
                    drawText(remainingText, currentX + textWidth / 2, y)
                }

                y += lineHeight
            }
        } else {
            // When stretching, we use a smooth CanvasGradient for the best effect.
            // When not stretching, we use character-by-character coloring to create a repeating pattern.
            if (stretchGradient) {
                ctx.textAlign = 'center'
                const lineMetrics = speakerLines.map(line => ({
                    line,
                    width: ctx.measureText(line).width
                }))
                const maxLineWidth = Math.max(
                    0,
                    ...lineMetrics.map(m => m.width)
                )

                if (maxLineWidth > 0) {
                    const x_start = width / 2 - maxLineWidth / 2
                    const x_end = width / 2 + maxLineWidth / 2
                    const gradientFill = ctx.createLinearGradient(
                        x_start,
                        0,
                        x_end,
                        0
                    )

                    gradientColors.forEach((color, index) => {
                        const offset =
                            gradientColors.length > 1
                                ? index / (gradientColors.length - 1)
                                : 0.5
                        gradientFill.addColorStop(offset, color)
                    })
                    ctx.fillStyle = gradientFill
                }

                for (const metrics of lineMetrics) {
                    speakerLineWidths.push(metrics.width)
                    ctx.fillText(metrics.line, width / 2, y)
                    y += lineHeight
                }
            } else {
                // Use character-by-character coloring for a repeating (non-stretched) gradient effect.
                // const totalChars = continuousGradient ? speakerLines.reduce((sum, line) => sum + line.length, 0) : 0 // This isn't actually used
                let charCount = 0

                for (const line of speakerLines) {
                    speakerLineWidths.push(ctx.measureText(line).width)
                    let x = width / 2 - ctx.measureText(line).width / 2
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i]
                        const position = continuousGradient ? charCount : i
                        const colorIndex = position % gradientColors.length

                        ctx.fillStyle = gradientColors[colorIndex]
                        ctx.textAlign = 'left'
                        const charWidth = ctx.measureText(char).width
                        ctx.fillText(char, x, y)
                        x += charWidth
                        charCount++
                    }
                    y += lineHeight
                }
                ctx.textAlign = 'center'
            }
        }

        if (style === 'acz') {
            const maxSpeakerLineWidth =
                speakerLineWidths.length > 0
                    ? Math.max(...speakerLineWidths)
                    : 0
            if (maxSpeakerLineWidth > 0) {
                y += lineHeight / 4
                const separatorWidth = maxSpeakerLineWidth * 1.2
                const separatorX = width / 2 - separatorWidth / 2
                ctx.fillStyle = speakerColor
                ctx.fillRect(separatorX, y, separatorWidth, 2)
                y += lineHeight / 2
            }
        }

        // Draw quote
        if (style === 'acz') {
            ctx.fillStyle = speakerColor
        } else {
            ctx.fillStyle = 'white'
        }
        y += 2

        for (let i = 0; i < quoteLines.length; i++) {
            const line = quoteLines[i]
            const lineStart = lineStartIndices[i]
            const nextLineStart = lineStartIndices[i + 1] || quote.length

            const lineEmojis = quoteEmojis
                .filter(e => e.index >= lineStart && e.index < nextLineStart)
                .sort((a, b) => a.index - b.index)

            // Adjust emoji indices relative to line start
            const adjustedEmojis = lineEmojis.map(emoji => ({
                ...emoji,
                relativeIndex: emoji.index - lineStart
            }))

            // Calculate line width including emojis
            let totalWidth = 0
            let currentPos = 0
            const lineText = line

            // Pre-calculate total width with emoji replacements
            for (const emoji of adjustedEmojis) {
                const textBefore = lineText.substring(
                    currentPos,
                    emoji.relativeIndex
                )
                if (emoji.type === 'ping') {
                    const username = usernames[emoji.id!] || emoji.full
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

            // Ace Combat 7/Zero specific opening arrows
            if ((style === 'ac7' || style === 'acz') && i === 0) {
                ctx.save()
                ctx.fillStyle =
                    gradient === 'none'
                        ? speakerColor
                        : stretchGradient
                          ? gradientColors[0]
                          : gradientColors[0]
                ctx.fillText('<<', currentX - 40, y)
                ctx.restore()
            }

            // Reset for actual drawing
            currentPos = 0
            for (const emoji of adjustedEmojis) {
                const textBefore = lineText.substring(
                    currentPos,
                    emoji.relativeIndex
                )
                if (textBefore) {
                    const textWidth = ctx.measureText(textBefore).width
                    drawText(textBefore, currentX + textWidth / 2, y)
                    currentX += textWidth
                }

                if (emoji.type === 'ping') {
                    const username = usernames[emoji.id!] || emoji.full
                    const pingWidth = ctx.measureText('@' + username).width
                    drawText(
                        emoji.full,
                        currentX + pingWidth / 2,
                        y,
                        true,
                        emoji.id
                    )
                    currentX += pingWidth
                } else {
                    // Find and draw the loaded emoji image
                    const loadedEmoji = emojiImages.find(
                        e =>
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
                drawText(remainingText, currentX + textWidth / 2, y)
                currentX += textWidth
            }

            // Surprise, we need closing arrows too
            if (
                (style === 'ac7' || style === 'acz') &&
                i === quoteLines.length - 1
            ) {
                ctx.save()
                ctx.fillStyle =
                    gradient === 'none'
                        ? speakerColor
                        : stretchGradient
                          ? gradientColors[gradientColors.length - 1]
                          : gradientColors[0]
                ctx.fillText('>>', currentX + 40, y)
                ctx.restore()
            }

            y += lineHeight
        }

        const endTime = performance.now()
        logger.debug(
            `Frame ${yellow(frameIndex + 1)} rendered in ${yellow((endTime - startTime).toFixed(2))}ms\n`
        )
        return canvas
    }

    if (hasAnimatedEmojis) {
        // Find all unique animated emojis
        const animatedEmojis = emojiImages.filter(
            (
                e
            ): e is typeof e & {
                frames: Canvas[]
                frameDelays: number[]
                framerate?: number
            } =>
                'frames' in e &&
                e.frames &&
                e.frames.length > 0 &&
                'frameDelays' in e
        )
        const uniqueAnimatedIds = new Set(animatedEmojis.map(e => e.id))

        // If there's only one unique animated emoji, use its framerate
        let targetFramerate = 20 // default
        if (uniqueAnimatedIds.size === 1) {
            const firstAnimatedEmoji = animatedEmojis[0]
            targetFramerate = firstAnimatedEmoji.frameDelays
                ? Math.round(1000 / firstAnimatedEmoji.frameDelays[0])
                : 20
        }

        const maxFrames = Math.max(
            ...animatedEmojis.map(e => e.frames.length)
        )
        logger.debug(
            `Creating animated image with ${yellow(maxFrames)} frames at ${yellow(targetFramerate)}fps\n`
        )

        const tmpDir = await createTempDir()
        const outputPath = path.join(tmpDir, 'output.gif')

        try {
            // Render frames to PNG files
            for (let i = 0; i < maxFrames; i++) {
                const canvas = await renderFrame(i)
                const framePath = path.join(tmpDir, `frame-${i + 1}.png`)
                await fs.writeFile(framePath, new Uint8Array(canvas.toBuffer()))

                if (i % 10 === 0) {
                    const progress = (((i + 1) / maxFrames) * 100).toFixed(1)
                    logger.debug(
                        `Frame progress: ${progress}% (${i + 1}/${maxFrames})`
                    )
                }
            }

            // Create GIF using FFmpeg with detected framerate
            logger.debug(
                `Creating GIF with FFmpeg at ${yellow(targetFramerate)}fps...`
            )
            const buffer = await ffmpegCreateGif(
                tmpDir,
                outputPath,
                targetFramerate
            )
            logger.debug(
                `GIF generation complete. Final size: ${yellow((buffer.length / 1024).toFixed(2))}KB\n`
            )

            return {
                buffer,
                type: 'image/gif'
            }
        } finally {
            await cleanupTempDir(tmpDir)
        }
    } else {
        logger.debug('Generating static image')
        const canvas = await renderFrame(0)
        return {
            buffer: canvas.toBuffer(),
            type: 'image/png'
        }
    }
}

parentPort!.on(
    'message',
    async (message: {
        type: string
        options: SubtitleOptions
        taskId: string
    }) => {
        if (message.type === 'generate') {
            try {
                const result = await performGeneration(message.options)
                parentPort!.postMessage({
                    type: 'result',
                    taskId: message.taskId,
                    data: result
                })
            } catch (e) {
                const error = e as Error
                logger.error(
                    `Error in subtitle worker: ${error.stack ?? error.message}`
                )
                parentPort!.postMessage({
                    type: 'error',
                    taskId: message.taskId,
                    error: error.message
                })
            }
        }
    }
)
