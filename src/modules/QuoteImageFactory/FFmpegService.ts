import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { type QuoteImageConfig } from './types'
import { Logger } from '../../util/logger'

const logger = new Logger('FFmpegService')

export class FFmpegService {
    constructor(private config: QuoteImageConfig) {}

    public async createGif(frames: Buffer[]): Promise<Buffer> {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gif-'))
        const outputPath = path.join(tmpDir, 'output.gif')

        try {
            // Write frames to temporary files
            for (let i = 0; i < frames.length; i++) {
                const framePath = path.join(tmpDir, `frame-${i + 1}.png`)
                await fs.writeFile(framePath, frames[i])
            }

            // Create GIF using FFmpeg
            logger.info(`Creating GIF with FFmpeg at ${this.config.defaultFramerate}fps...`)
            const buffer = await this.ffmpegCreateGif(tmpDir, outputPath, this.config.defaultFramerate)
            logger.ok(`GIF generation complete. Final size: ${(buffer.length / 1024).toFixed(2)}KB`)

            return buffer
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true })
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
            ffmpeg.stderr.on('data', data => {
                stderr += data.toString()
            })

            ffmpeg.on('close', async code => {
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

            ffmpeg.on('error', error => {
                reject(new Error(`Failed to start FFmpeg: ${error}`))
            })
        })
    }
}
