import { loadImage, type Image } from 'canvas'
import { type QuoteImageConfig, type EmojiData, type ProcessedEmojiData } from './types'
import { Logger } from '../../util/logger'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const logger = new Logger('EmojiProcessor')

export class EmojiProcessor {
    private emojiCache: Map<string, Image | { frames: Image[], frameDelays: number[], framerate: number }> = new Map()

    constructor(private config: QuoteImageConfig) {}

    public async processEmojis(
        speakerEmojis: EmojiData[],
        quoteEmojis: EmojiData[]
    ): Promise<ProcessedEmojiData> {
        const allEmojis = [...speakerEmojis, ...quoteEmojis]
        const hasAnimatedEmojis = allEmojis.some(e => e.animated)

        logger.info(`Processing ${allEmojis.length} emojis (${hasAnimatedEmojis ? 'with' : 'without'} animation)`)

        const processedEmojis = await Promise.all(
            allEmojis.map(async (emoji, index) => {
                try {
                    if (emoji.animated) {
                        logger.info(`Loading animated emoji ${index + 1}/${allEmojis.length}: ${emoji.name || emoji.id}`)
                        const result = await this.loadAnimatedEmoji(emoji)
                        return {
                            data: emoji,
                            frames: result.frames,
                            frameDelays: result.frameDelays,
                            framerate: result.framerate
                        }
                    } else {
                        logger.info(`Loading static emoji ${index + 1}/${allEmojis.length}`)
                        const result = await this.loadStaticEmoji(emoji)
                        return {
                            data: emoji,
                            image: result.image
                        }
                    }
                } catch (error) {
                    logger.error(`Failed to load emoji: ${emoji.name || emoji.id}\n${error}`)
                    return { data: emoji }
                }
            })
        )

        return {
            hasAnimatedEmojis,
            emojis: processedEmojis
        }
    }

    private async loadStaticEmoji(emoji: EmojiData): Promise<{ data: EmojiData; image: Image }> {
        if (!emoji.url) {
            throw new Error(`No URL provided for emoji: ${emoji.name || emoji.id}`)
        }

        const cached = this.emojiCache.get(emoji.url)
        if (cached) {
            return { data: emoji, image: cached as Image }
        }

        const image = await loadImage(emoji.url)
        this.emojiCache.set(emoji.url, image)
        return { data: emoji, image }
    }

    private async loadAnimatedEmoji(emoji: EmojiData): Promise<{ data: EmojiData; frames: Image[]; frameDelays: number[]; framerate: number }> {
        if (!emoji.url) {
            throw new Error(`No URL provided for animated emoji: ${emoji.name || emoji.id}`)
        }

        const cached = this.emojiCache.get(emoji.url)
        if (cached) {
            return { data: emoji, ...cached as { frames: Image[]; frameDelays: number[]; framerate: number } }
        }

        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emoji-'))
        try {
            // Download GIF to temp file
            const response = await fetch(emoji.url)
            const buffer = Buffer.from(await response.arrayBuffer())
            const gifPath = path.join(tmpDir, 'temp.gif')
            await fs.writeFile(gifPath, buffer)

            // Extract frame information
            const { frames, delays, framerate } = await this.extractFrames(gifPath, tmpDir)
            const loadedFrames = await Promise.all(frames.map(f => loadImage(f)))

            const result = {
                frames: loadedFrames,
                frameDelays: delays,
                framerate
            }

            this.emojiCache.set(emoji.url, result)
            return { data: emoji, ...result }
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true })
        }
    }

    private async extractFrames(gifPath: string, outputDir: string): Promise<{
        frames: string[]
        delays: number[]
        framerate: number
    }> {
        return new Promise((resolve, reject) => {
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
            ffprobeDurations.on('close', async code => {
                if (code !== 0) {
                    reject(new Error(`FFprobe failed with code ${code}`))
                    return
                }

                const durations = durationsStr.trim().split('\n').map(Number)
                const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
                const framerate = Math.round(1 / avgDuration)

                // Extract frames
                const ffmpeg = spawn('ffmpeg', [
                    '-i', gifPath,
                    '-vsync', '0',
                    '-frame_pts', '1',
                    path.join(outputDir, 'frame-%d.png')
                ])

                ffmpeg.on('close', async code => {
                    if (code === 0) {
                        const frameFiles = await fs.readdir(outputDir)
                        const pngFiles = frameFiles
                            .filter(f => f.startsWith('frame-') && f.endsWith('.png'))
                            .sort((a, b) => {
                                const numA = parseInt(a.match(/frame-(\d+)\.png/)?.[1] || '0')
                                const numB = parseInt(b.match(/frame-(\d+)\.png/)?.[1] || '0')
                                return numA - numB
                            })
                            .map(f => path.join(outputDir, f))

                        resolve({
                            frames: pngFiles,
                            delays: durations.map(d => d * 1000), // s => ms
                            framerate
                        })
                    } else {
                        reject(new Error(`FFmpeg failed with code ${code}`))
                    }
                })
            })
        })
    }
}
