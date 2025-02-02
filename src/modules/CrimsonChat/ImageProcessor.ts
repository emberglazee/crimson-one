import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { Logger } from '../../util/logger'
import { normalizeUrl, cleanImageUrl } from './utils/urlUtils'

const logger = new Logger('ImageProcessor')

export class ImageProcessor {
    public normalizeUrl = normalizeUrl
    public cleanImageUrl = cleanImageUrl

    async extractFirstFrameFromGif(url: string): Promise<Buffer | null> {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gif-frame-'))
        const outputPath = path.join(tmpDir, 'frame.png')
        const gifPath = path.join(tmpDir, 'temp.gif')

        try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`Failed to fetch GIF: ${response.statusText}`)

            const buffer = Buffer.from(await response.arrayBuffer())
            await fs.writeFile(gifPath, buffer)

            return new Promise((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-y',
                    '-i', gifPath,
                    '-vframes', '1',
                    '-vf', 'scale=-1:-1',
                    '-f', 'image2',
                    outputPath
                ])

                ffmpeg.on('close', async (code) => {
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
        } catch (error) {
            logger.error(`Failed to extract first frame: ${error}`)
            return null
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true })
                .catch(error => logger.error(`Failed to cleanup temp directory: ${error}`))
        }
    }

    async fetchAndConvertToBase64(url: string): Promise<string | null> {
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
        } catch (error) {
            logger.error(`Failed to fetch and convert image: ${error}`)
            return null
        }
    }
}
