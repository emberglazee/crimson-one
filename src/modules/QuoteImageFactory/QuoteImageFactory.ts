import { Logger } from '../../util/logger'
import { TextLayoutEngine } from './TextLayoutEngine'
import { EmojiProcessor } from './EmojiProcessor'
import { CanvasRenderer } from './CanvasRenderer'
import { FFmpegService } from './FFmpegService'
import { type QuoteImageConfig } from './types'
import { type QuoteImageResult, type QuoteStyle } from './types'
import { type GradientType } from '../../util/colors'

const logger = new Logger('QuoteImageFactory')

export class QuoteImageFactory {
    private static instance: QuoteImageFactory
    private usernames: Map<string, string>
    private textLayoutEngine: TextLayoutEngine
    private emojiProcessor: EmojiProcessor
    private canvasRenderer: CanvasRenderer
    private ffmpegService: FFmpegService

    private constructor(config: QuoteImageConfig) {
        this.usernames = new Map()
        this.textLayoutEngine = new TextLayoutEngine(config)
        this.emojiProcessor = new EmojiProcessor(config)
        this.canvasRenderer = new CanvasRenderer(config)
        this.ffmpegService = new FFmpegService(config)
    }

    public static getInstance(config: QuoteImageConfig): QuoteImageFactory {
        if (!QuoteImageFactory.instance) {
            QuoteImageFactory.instance = new QuoteImageFactory(config)
        }
        return QuoteImageFactory.instance
    }

    public setUsernames(userMap: Record<string, string>) {
        this.usernames = new Map(Object.entries(userMap))
    }

    public async createQuoteImage(
        speaker: string,
        quote: string,
        color: string | null,
        gradient: GradientType,
        stretchGradient = false,
        style: QuoteStyle = 'pw',
        interpretNewlines = false
    ): Promise<QuoteImageResult> {
        try {
            // Process text and layout
            const layout = await this.textLayoutEngine.calculateLayout(
                speaker,
                quote,
                interpretNewlines,
                style
            )

            // Process emojis
            const emojiData = await this.emojiProcessor.processEmojis(
                layout.speakerEmojis,
                layout.quoteEmojis
            )

            // Render frames
            const frames = await this.canvasRenderer.renderFrames(
                layout,
                emojiData,
                color,
                gradient,
                stretchGradient,
                style,
                this.usernames
            )

            // Handle animation if needed
            if (emojiData.hasAnimatedEmojis) {
                const gifBuffer = await this.ffmpegService.createGif(frames)
                return {
                    buffer: gifBuffer,
                    type: 'image/gif'
                }
            } else {
                return {
                    buffer: frames[0],
                    type: 'image/png'
                }
            }
        } catch (error) {
            logger.error('Error creating quote image: ' + error)
            throw error
        }
    }
}
