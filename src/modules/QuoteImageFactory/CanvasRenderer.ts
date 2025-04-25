import { createCanvas, type CanvasRenderingContext2D, type Image } from 'canvas'
import { type QuoteImageConfig, type TextLayout, type ProcessedEmojiData, type QuoteStyle, type RenderFrameParams } from './types'
import { Logger } from '../../util/logger'
import { TRANS_COLORS, RAINBOW_COLORS, ITALIAN_COLORS, type GradientType } from '../../util/colors'

const logger = new Logger('CanvasRenderer')

interface EmojiData {
    id?: string
    full: string
    index: number
    length: number
    frames?: Image[]
    image?: Image
    type?: 'ping' | 'emoji'
}

export class CanvasRenderer {
    constructor(private config: QuoteImageConfig) {}

    public async renderFrames(
        layout: TextLayout,
        emojiData: ProcessedEmojiData,
        color: string | null,
        gradient: GradientType,
        stretchGradient: boolean,
        style: QuoteStyle,
        usernames: Map<string, string>
    ): Promise<Buffer[]> {
        const frames: Buffer[] = []
        const maxFrames = emojiData.hasAnimatedEmojis
            ? Math.max(...emojiData.emojis
                .filter(e => e.frames)
                .map(e => e.frames!.length))
            : 1

        for (let frameIndex = 0; frameIndex < maxFrames; frameIndex++) {
            logger.info(`Rendering frame ${frameIndex + 1}/${maxFrames}`)
            const startTime = performance.now()

            const canvas = await this.renderFrame({
                layout,
                emojiData,
                color,
                gradient,
                stretchGradient,
                style,
                usernames
            }, frameIndex)

            frames.push(canvas.toBuffer())
            const endTime = performance.now()
            logger.info(`Frame ${frameIndex + 1} rendered in ${(endTime - startTime).toFixed(2)}ms`)
        }

        return frames
    }

    private async renderFrame(
        params: RenderFrameParams,
        frameIndex: number
    ): Promise<ReturnType<typeof createCanvas>> {
        const { layout, emojiData, color, gradient, stretchGradient, style, usernames } = params
        const canvas = createCanvas(layout.width, layout.height)
        const ctx = canvas.getContext('2d')
        const gradientColors = gradient === 'trans' ? TRANS_COLORS
            : gradient === 'rainbow' ? RAINBOW_COLORS
            : ITALIAN_COLORS

        // Setup context
        ctx.font = `${this.config.fontSize}px ${this.config.font[style]}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.shadowColor = 'black'
        ctx.shadowBlur = 8

        // Clear canvas
        ctx.clearRect(0, 0, layout.width, layout.height)

        // Draw speaker name
        let y = 50
        if (gradient === 'none') {
            ctx.fillStyle = color || '#FFFFFF'
            this.drawTextWithEmojis(ctx, layout.speakerLines, layout.speakerStartIndices, layout.speakerEmojis, emojiData, y, frameIndex, usernames)
        } else {
            for (const line of layout.speakerLines) {
                let x = layout.width / 2 - ctx.measureText(line).width / 2
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
                y += this.config.lineHeight
            }
            ctx.textAlign = 'center'
        }

        // Draw quote
        ctx.fillStyle = 'white'
        y += 2

        for (let i = 0; i < layout.quoteLines.length; i++) {
            const line = layout.quoteLines[i]
            const lineStart = layout.lineStartIndices[i]
            const nextLineStart = layout.lineStartIndices[i + 1] || layout.quoteLines.join('').length

            const lineEmojis = layout.quoteEmojis.filter(e =>
                e.index >= lineStart && e.index < nextLineStart
            ).sort((a, b) => a.index - b.index)

            // Draw AC7 opening arrows if needed
            if (style === 'ac7' && i === 0) {
                ctx.fillStyle = gradient === 'none' ? (color || '#FFFFFF') : (stretchGradient ? gradientColors[0] : gradientColors[0])
                ctx.fillText('<<', layout.width / 2 - ctx.measureText(line).width / 2 - 40, y)
                ctx.fillStyle = 'white'
            }

            this.drawTextWithEmojis(ctx, [line], [lineStart], lineEmojis, emojiData, y, frameIndex, usernames)

            // Draw AC7 closing arrows if needed
            if (style === 'ac7' && i === layout.quoteLines.length - 1) {
                ctx.fillStyle = gradient === 'none' ? (color || '#FFFFFF') : (stretchGradient ? gradientColors[gradientColors.length - 1] : gradientColors[0])
                ctx.fillText('>>', layout.width / 2 + ctx.measureText(line).width / 2 + 40, y)
            }

            y += this.config.lineHeight
        }

        return canvas
    }

    private drawTextWithEmojis(
        ctx: CanvasRenderingContext2D,
        lines: string[],
        startIndices: number[],
        emojis: EmojiData[],
        emojiData: ProcessedEmojiData,
        y: number,
        frameIndex: number,
        usernames: Map<string, string>
    ) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const lineStart = startIndices[i]
            const nextLineStart = startIndices[i + 1] || line.length

            const lineEmojis = emojis.filter(e =>
                e.index >= lineStart && e.index < nextLineStart
            ).sort((a, b) => a.index - b.index)

            const adjustedEmojis = lineEmojis.map(emoji => ({
                ...emoji,
                relativeIndex: emoji.index - lineStart
            }))

            // Calculate total width
            let totalWidth = 0
            let currentPos = 0
            const lineText = line

            for (const emoji of adjustedEmojis) {
                const textBefore = lineText.substring(currentPos, emoji.relativeIndex)
                totalWidth += ctx.measureText(textBefore).width
                if (emoji.type === 'ping') {
                    const username = usernames.get(emoji.id!) || emoji.full
                    totalWidth += ctx.measureText('@' + username).width
                } else {
                    totalWidth += this.config.fontSize
                }
                currentPos = emoji.relativeIndex + emoji.length
            }
            totalWidth += ctx.measureText(lineText.substring(currentPos)).width

            // Draw text and emojis
            const centerX = ctx.canvas.width / 2
            let currentX = centerX - totalWidth / 2
            currentPos = 0

            for (const emoji of adjustedEmojis) {
                const textBefore = lineText.substring(currentPos, emoji.relativeIndex)
                if (textBefore) {
                    const textWidth = ctx.measureText(textBefore).width
                    ctx.fillText(textBefore, currentX + textWidth/2, y)
                    currentX += textWidth
                }

                if (emoji.type === 'ping') {
                    const username = usernames.get(emoji.id!) || emoji.full
                    const pingWidth = ctx.measureText('@' + username).width
                    this.drawPing(ctx, emoji.full, currentX + pingWidth/2, y, emoji.id, username)
                    currentX += pingWidth
                } else {
                    const loadedEmoji = emojiData.emojis.find(e =>
                        (emoji.id && e.data.id === emoji.id) ||
                        (!emoji.id && e.data.full === emoji.full)
                    )
                    if (loadedEmoji) {
                        this.drawEmoji(ctx, loadedEmoji, currentX, y, frameIndex)
                    }
                    currentX += this.config.fontSize
                }
                currentPos = emoji.relativeIndex + emoji.length
            }

            const remainingText = lineText.substring(currentPos)
            if (remainingText) {
                const textWidth = ctx.measureText(remainingText).width
                ctx.fillText(remainingText, currentX + textWidth/2, y)
            }
        }
    }

    private drawPing(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, id: string | undefined, username: string) {
        ctx.save()

        // Draw background with lighter ping color
        const textWidth = ctx.measureText('@' + username).width
        ctx.fillStyle = '#7289DA30' // Discord ping color with 30% opacity
        const bgPadding = this.config.fontSize * 0.2
        const bgHeight = this.config.fontSize * 1.1
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
        ctx.fillText('@' + username, x, y)

        ctx.restore()
    }

    private drawEmoji(ctx: CanvasRenderingContext2D, emoji: { frames?: Image[], image?: Image }, x: number, y: number, frameIndex: number) {
        if (emoji.frames) {
            const frame = emoji.frames[frameIndex % emoji.frames.length]
            ctx.drawImage(frame, x, y + (this.config.fontSize * 0.1), this.config.fontSize, this.config.fontSize)
        } else if (emoji.image) {
            ctx.drawImage(emoji.image, x, y + (this.config.fontSize * 0.1), this.config.fontSize, this.config.fontSize)
        }
    }
}
