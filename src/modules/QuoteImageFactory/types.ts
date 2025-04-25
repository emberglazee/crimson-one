import { type GradientType } from '../../util/colors'
import { type Image } from 'canvas'

export type QuoteStyle = 'pw' | 'ac7'

export interface QuoteImageResult {
    buffer: Buffer
    type: 'image/gif' | 'image/png'
}

export interface QuoteImageConfig {
    fontSize: number
    lineHeight: number
    padding: number
    minWidth: number
    maxWidth: number
    defaultFramerate: number
    font: {
        pw: string
        ac7: string
    }
}

export interface TextLayout {
    speakerLines: string[]
    speakerStartIndices: number[]
    quoteLines: string[]
    lineStartIndices: number[]
    speakerEmojis: EmojiData[]
    quoteEmojis: EmojiData[]
    width: number
    height: number
}

export interface EmojiData {
    full: string
    id?: string
    name?: string
    index: number
    length: number
    url?: string
    animated?: boolean
    type?: 'ping'
}

export interface ProcessedEmojiData {
    hasAnimatedEmojis: boolean
    emojis: Array<{
        data: EmojiData
        image?: Image
        frames?: Image[]
        frameDelays?: number[]
        framerate?: number
    }>
}

export interface RenderFrameParams {
    layout: TextLayout
    emojiData: ProcessedEmojiData
    color: string | null
    gradient: GradientType
    stretchGradient: boolean
    style: QuoteStyle
    usernames: Map<string, string>
}
