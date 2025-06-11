import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { Logger } from '../../util/logger'
import { normalizeUrl, cleanImageUrl } from './util/url-utils'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | ImageProcessor')

export class ImageProcessor {
    public normalizeUrl = normalizeUrl
    public cleanImageUrl = cleanImageUrl

    public async fetchAndConvertToBase64(url: string): Promise<`data:${'image/png' | 'image/jpeg'};base64,${string}` | null> {
        try {
            const urlObj = new URL(url)
            const isGif = urlObj.pathname.toLowerCase().endsWith('.gif')

            let buffer: Buffer
            if (isGif) {
                const frameBuffer = await this.extractFirstFrameFromGif(url)
                if (!frameBuffer) return null
                buffer = frameBuffer
            } else {
                const response = await fetch(url)
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
                buffer = Buffer.from(await response.arrayBuffer())
            }

            const base64 = buffer.toString('base64')
            const mimeType = isGif ? 'image/png' : 'image/jpeg'
            return `data:${mimeType};base64,${base64}`
        } catch (e) {
            const error = e as Error
            logger.error(`Failed to fetch and convert image: ${chalk.red(error.message)}`)
            return null
        }
    }

    private async extractFirstFrameFromGif(url: string): Promise<Buffer | null> {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gif-frame-'))
        const outputPath = path.join(tmpDir, 'frame.png')
        const gifPath = path.join(tmpDir, 'temp.gif')

        try {
            const buffer = await this.fetchImageBuffer(url)
            await fs.writeFile(gifPath, buffer)
            return await this.extractFrameWithFFmpeg(gifPath, outputPath)
        } catch (e) {
            const error = e as Error
            logger.error(`Failed to extract first frame: ${chalk.red(error.message)}`)
            return null
        } finally {
            await this.cleanupTempDir(tmpDir)
        }
    }

    private async extractFrameWithFFmpeg(inputPath: string, outputPath: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-y',
                '-i', inputPath,
                '-vframes', '1',
                '-vf', 'scale=-1:480',
                '-f', 'image2',
                outputPath
            ])
            ffmpeg.on('close', async code => {
                if (code === 0) {
                    try {
                        const frameBuffer = await fs.readFile(outputPath)
                        resolve(frameBuffer)
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`))
                }
            })
            ffmpeg.on('error', reject)
        })
    }
    private async cleanupTempDir(dir: string): Promise<void> {
        try {
            await fs.rm(dir, { recursive: true, force: true })
        } catch (e) {
            const error = e as Error
            logger.error(`Failed to cleanup temp directory: ${chalk.red(error.message)}`)
        }
    }
    private async fetchImageBuffer(url: string): Promise<Buffer> {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        return Buffer.from(await response.arrayBuffer())
    }
}
