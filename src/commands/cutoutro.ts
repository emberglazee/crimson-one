import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import { writeFile } from 'fs/promises'
import { spawn } from 'child_process'

export default {
    data: new SlashCommandBuilder()
        .setName('cutoutro')
        .setDescription('Cut the outro of a TikTok or an Instagram Reel')
        .addAttachmentOption(ao => ao
            .setName('video')
            .setDescription('Video to cut the outro of (must be supported by ffmpeg)')
            .setRequired(true)
        ),
    async execute(context) {
        await context.deferReply()
        const video = await context.getAttachmentOption('video', true)
        const videoUrl = video.url
        const videoName = video.name
        const videoExtension = video.name.split('.').pop()
        const videoPath = `./data/${videoName}.${videoExtension}`
        await context.editReply('Downloading video...')
        const videoBuffer = await fetch(videoUrl).then(res => res.arrayBuffer())
        await writeFile(videoPath, Buffer.from(videoBuffer))
        await context.editReply('Cutting outro...')
        const outputPath = `./data/${videoName}_cut.${videoExtension}`
        const duration = await getVideoDuration(videoPath)
        const command = `ffmpeg -i ${videoPath} -c copy -t ${duration - 5} ${outputPath}`
        const child = spawn(command)
        child.on('close', async code => {
            if (code === 0) {
                await context.editReply({
                    content: 'Done!',
                    files: [{
                        attachment: outputPath,
                        name: `${videoName}_cut.${videoExtension}`
                    }]
                })
            } else {
                await context.editReply('Error cutting outro')
            }
        })
    }
} satisfies SlashCommand


async function getVideoDuration(videoPath: string): Promise<number> {
    const command = `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 ${videoPath}`
    const child = spawn(command)
    const duration = await new Promise<string>(resolve => {
        child.stdout.on('data', data => {
            resolve(data.toString())
        })
    })
    return Number(duration)
}
