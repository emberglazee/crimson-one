import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas'
import { type QuoteImageConfig, type TextLayout, type EmojiData, type QuoteStyle } from './types'

export class TextLayoutEngine {
    private measureCanvas: Canvas
    private measureCtx: CanvasRenderingContext2D

    constructor(private config: QuoteImageConfig) {
        this.measureCanvas = createCanvas(1, 1)
        this.measureCtx = this.measureCanvas.getContext('2d')
        this.measureCtx.font = `${config.fontSize}px ${config.font.pw}`
    }

    public async calculateLayout(
        speaker: string,
        quote: string,
        interpretNewlines: boolean,
        style: QuoteStyle
    ): Promise<TextLayout> {
        // Process newlines if needed
        if (interpretNewlines) {
            speaker = speaker.replace(/<newline>/g, '\n')
            quote = quote.replace(/<newline>/g, '\n')
        }

        // Parse emojis from both speaker and quote
        const speakerEmojis = this.parseEmojis(speaker)
        const quoteEmojis = this.parseEmojis(quote)

        // Calculate optimal width
        const speakerWidth = this.calculateRequiredWidth(speaker, speakerEmojis, style)
        const quoteWidth = this.calculateRequiredWidth(quote, quoteEmojis, style)
        const requiredWidth = Math.max(speakerWidth, quoteWidth)
        const width = Math.min(Math.max(this.config.minWidth, requiredWidth), this.config.maxWidth)

        // Word wrap speaker and quote
        const speakerLayout = this.wordWrap(speaker, speakerEmojis, width, style)
        const quoteLayout = this.wordWrap(quote, quoteEmojis, width, style)

        // Calculate total height
        const height = 50 + // Top padding
            (speakerLayout.lines.length * this.config.lineHeight) + // Speaker height
            2 + // Gap between speaker and quote
            (quoteLayout.lines.length * this.config.lineHeight) + // Quote height
            this.config.padding // Bottom padding

        return {
            speakerLines: speakerLayout.lines,
            speakerStartIndices: speakerLayout.startIndices,
            quoteLines: quoteLayout.lines,
            lineStartIndices: quoteLayout.startIndices,
            speakerEmojis,
            quoteEmojis,
            width,
            height
        }
    }

    private parseEmojis(text: string): EmojiData[] {
        const results: EmojiData[] = []

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

        // Parse custom Discord emojis
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

        // Parse Unicode emojis
        const unicodeEmojiRegex = /\p{Emoji}/gu
        const unicodeMatches = [...text.matchAll(unicodeEmojiRegex)]
        results.push(...unicodeMatches.map(match => ({
            full: match[0],
            index: match.index!,
            length: match[0].length,
            url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${this.toCodePoint(match[0])}.png`
        })))

        return results.sort((a, b) => a.index - b.index)
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

    private calculateRequiredWidth(text: string, emojis: EmojiData[], style: QuoteStyle): number {
        let maxLineWidth = 0
        const lines = text.split('\n')
        let currentIndex = 0

        for (const line of lines) {
            let lineWidth = 0
            const words = line.split(' ')
            for (const word of words) {
                lineWidth += this.measureWordWidth(word, currentIndex, emojis) +
                    (lineWidth > 0 ? this.measureCtx.measureText(' ').width : 0)
            }
            maxLineWidth = Math.max(maxLineWidth, lineWidth)
            currentIndex += line.length + 1
        }

        return maxLineWidth + this.config.padding * 2 + (style === 'ac7' ? 80 : 0)
    }

    private measureWordWidth(word: string, startIndex: number, emojis: EmojiData[]): number {
        let width = this.measureCtx.measureText(word).width
        const wordEmojis = emojis.filter(e =>
            e.index >= startIndex &&
            e.index < startIndex + word.length
        )
        for (const emoji of wordEmojis) {
            width -= this.measureCtx.measureText(emoji.full).width
            if (emoji.type === 'ping') {
                width += this.measureCtx.measureText('@user').width
            } else {
                width += this.config.fontSize
            }
        }
        return width
    }

    private wordWrap(text: string, emojis: EmojiData[], width: number, style: QuoteStyle): { lines: string[], startIndices: number[] } {
        const lines: string[] = []
        const startIndices: number[] = []
        const effectiveMaxWidth = width - this.config.padding * 2 - (style === 'ac7' ? 80 : 0)
        let currentIndex = 0
        const textLines = text.split('\n')

        for (const textLine of textLines) {
            const words = textLine.split(' ')
            for (let i = 0; i < words.length; i++) {
                const word = words[i]
                const wordWidth = this.measureWordWidth(word, currentIndex, emojis)

                if (wordWidth > effectiveMaxWidth) {
                    // Split long word into chunks
                    let remainingWord = word
                    let remainingIndex = currentIndex

                    while (remainingWord.length > 0) {
                        let chunkLength = remainingWord.length
                        while (chunkLength > 0 && this.measureWordWidth(remainingWord.slice(0, chunkLength), remainingIndex, emojis) > effectiveMaxWidth) {
                            chunkLength--
                        }

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
                    const testLine = isFirstWord ? word : lines[lines.length - 1] + ' ' + word
                    const testWidth = isFirstWord ? wordWidth : this.measureWordWidth(testLine, startIndices[startIndices.length - 1], emojis)

                    if (!isFirstWord && testWidth <= effectiveMaxWidth) {
                        lines[lines.length - 1] = testLine
                    } else {
                        lines.push(word)
                        startIndices.push(currentIndex)
                    }
                    currentIndex += word.length + 1
                }
            }
        }

        return { lines, startIndices }
    }
}
