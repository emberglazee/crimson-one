import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { createCanvas, registerFont } from 'canvas'
import path from 'path'

const fontPath = path.join(__dirname, '../../data/Roboto.ttf')
registerFont(fontPath, { family: 'Roboto' })

export default {
    data: new SlashCommandBuilder()
        .setName('pwquote')
        .setDescription('Generate an image out of a text and speaker name styled as a Project Wingman subtitle')
        .addStringOption(so => so
            .setName('speaker')
            .setDescription('Who is speaking?')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('quote')
            .setDescription('What are they saying?')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('color')
            .setDescription('Color of the speaker')
            .setRequired(true)
            .setChoices(
                ['gray', 'red', 'green', 'yellow', 'blue', 'pink', 'cyan'].map(color => { return { name: color, value: color }})
            )
        ),
    async execute(interaction) {
        const speaker = interaction.options.getString('speaker', true)
        const quote = interaction.options.getString('quote', true)
        const color = interaction.options.getString('color', true) as 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'pink' | 'cyan'
        await interaction.deferReply()
        const image = createQuoteImage(speaker, quote, color)
        await interaction.editReply({ files: [image] })
    }
} satisfies SlashCommand

function createQuoteImage(speaker: string, quote: string, color: 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'pink' | 'cyan') {
    const fontSize = 48
    const lineHeight = fontSize * 1.2
    const padding = 40
    const width = 1024
    const maxWidth = width - padding * 2

    // Create canvas for measurements
    const measureCanvas = createCanvas(1, 1)
    const measureCtx = measureCanvas.getContext('2d')
    measureCtx.font = `${fontSize}px Roboto`

    // Word wrap speaker name
    const speakerWords = speaker.split(' ')
    const speakerLines: string[] = []
    let currentLine = speakerWords[0]

    for (let i = 1; i < speakerWords.length; i++) {
        const word = speakerWords[i]
        const testLine = currentLine + ' ' + word
        const metrics = measureCtx.measureText(testLine)

        if (metrics.width > maxWidth) {
            speakerLines.push(currentLine)
            currentLine = word
        } else currentLine = testLine
    }
    speakerLines.push(currentLine)

    // Word wrap quote
    const words = quote.split(' ')
    const quoteLines: string[] = []
    currentLine = words[0]

    for (let i = 1; i < words.length; i++) {
        const word = words[i]
        const testLine = currentLine + ' ' + word
        const metrics = measureCtx.measureText(testLine)

        if (metrics.width > maxWidth) {
            quoteLines.push(currentLine)
            currentLine = word
        } else currentLine = testLine
    }
    quoteLines.push(currentLine)

    // Calculate height based on number of lines
    const speakerHeight = speakerLines.length * lineHeight
    const height = 50 + speakerHeight + (quoteLines.length * lineHeight) + padding

    // Create final canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    const colorMap = {
        gray: '#B0B0B0',
        red: '#FF5555',
        green: '#55FF55',
        yellow: '#FFFF55',
        blue: '#5555FF',
        pink: '#FF55FF',
        cyan: '#55FFFF',
    }

    const speakerColor = colorMap[color] || '#FFFFFF'

    ctx.clearRect(0, 0, width, height)
    ctx.font = `${fontSize}px Roboto`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'black'
    ctx.shadowBlur = 8

    // Draw speaker name
    ctx.fillStyle = speakerColor
    let y = 50
    for (const line of speakerLines) {
        ctx.fillText(line, width / 2, y)
        y += lineHeight
    }

    // Draw quote
    ctx.fillStyle = 'white'
    y += lineHeight / 2 // Add some spacing between speaker and quote
    for (const line of quoteLines) {
        ctx.fillText(line, width / 2, y)
        y += lineHeight
    }

    return canvas.toBuffer()
}
