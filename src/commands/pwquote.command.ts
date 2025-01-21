import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { createCanvas, registerFont } from 'canvas'
import path from 'path'

const fontPath = path.join(__dirname, '../../data/Roboto.ttf')
registerFont(fontPath, { family: 'Roboto' })

type ColorName = 'Gray' | 'Red' | 'Green' | 'Yellow' | 'Blue' | 'Pink' | 'Cyan' |
    'White' | 'Orange' | 'Purple' | 'Brown' | 'Lime' | 'Teal' | 'Navy' |
    'Peacekeeper Red' | 'Faust Green' | 'The Home Depot Orange' | 'FakeDev Orange' |
    'Wikiyellow' | 'Federation Blue' | 'Cascadian Teal' | 'Mercenary Yellow' |
    'PWcord Moderator Turquoise' | 'Voice Actor Blue' | 'Mugged Pink'

interface ColorDefinition {
    name: ColorName
    hex: string
}

const COLORS: ColorDefinition[] = [
    { name: 'Gray', hex: '#B0B0B0' },
    { name: 'Red', hex: '#FF5555' },
    { name: 'Green', hex: '#55FF55' },
    { name: 'Yellow', hex: '#FFFF55' },
    { name: 'Blue', hex: '#5555FF' },
    { name: 'Pink', hex: '#FF55FF' },
    { name: 'Cyan', hex: '#55FFFF' },
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Orange', hex: '#FFA500' },
    { name: 'Purple', hex: '#8A2BE2' },
    { name: 'Brown', hex: '#A52A2A' },
    { name: 'Lime', hex: '#32CD32' },
    { name: 'Teal', hex: '#008080' },
    { name: 'Navy', hex: '#000080' },
    { name: 'Peacekeeper Red', hex: '#992D22' },
    { name: 'Faust Green', hex: '#1F8b4C' },
    { name: 'The Home Depot Orange', hex: '#F96302' },
    { name: 'FakeDev Orange', hex: '#E67E22' },
    { name: 'Wikiyellow', hex: '#FFB40B' },
    { name: 'Federation Blue', hex: '#0C0D3B' },
    { name: 'Cascadian Teal', hex: '#2BBCC2' },
    { name: 'Mercenary Yellow', hex: '#BBAD2C' },
    { name: 'PWcord Moderator Turquoise', hex: '#1ABC9C' },
    { name: 'Voice Actor Blue', hex: '#86A4C7' },
    { name: 'Mugged Pink', hex: '#FFABF3' }
];

type GradientType = 'none' | 'trans' | 'rainbow';

const TRANS_COLORS = ['#55CDFC', '#F7A8B8', '#FFFFFF', '#F7A8B8', '#55CDFC'];
const RAINBOW_COLORS = ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'];

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
                COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(so => so
            .setName('gradient')
            .setDescription('Use gradient colors for speaker name')
            .setRequired(false)
            .setChoices(
                { name: 'Trans Flag', value: 'trans' },
                { name: 'Rainbow', value: 'rainbow' }
            )
        ),
    async execute(interaction) {
        const speaker = interaction.options.getString('speaker', true)
        const quote = interaction.options.getString('quote', true)
        const color = interaction.options.getString('color', true) as ColorName
        const gradient = (interaction.options.getString('gradient') ?? 'none') as GradientType
        await interaction.deferReply()
        const image = createQuoteImage(speaker, quote, color, gradient)
        await interaction.editReply({ files: [image] })
    }
} satisfies SlashCommand

function createQuoteImage(speaker: string, quote: string, color: ColorName, gradient: GradientType) {
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
    const height = 50 + speakerHeight + 2 + (quoteLines.length * lineHeight) + padding

    // Create final canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    const speakerColor = COLORS.find(c => c.name === color)?.hex || '#FFFFFF'

    ctx.clearRect(0, 0, width, height)
    ctx.font = `${fontSize}px Roboto`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'black'
    ctx.shadowBlur = 8
    let y = 50

    // Draw speaker name
    if (gradient === 'none') {
        ctx.fillStyle = speakerColor
        for (const line of speakerLines) {
            ctx.fillText(line, width / 2, y)
            y += lineHeight
        }
    } else {
        const gradientColors = gradient === 'trans' ? TRANS_COLORS : RAINBOW_COLORS
        for (const line of speakerLines) {
            let x = width / 2 - ctx.measureText(line).width / 2
            for (let i = 0; i < line.length; i++) {
                const char = line[i]
                ctx.fillStyle = gradientColors[i % gradientColors.length]
                ctx.textAlign = 'left'
                const charWidth = ctx.measureText(char).width
                ctx.fillText(char, x, y)
                x += charWidth
            }
            y += lineHeight
        }
        ctx.textAlign = 'center'
    }

    // Draw quote
    ctx.fillStyle = 'white'
    y += 2 // Add 2px spacing between speaker and quote
    for (const line of quoteLines) {
        ctx.fillText(line, width / 2, y)
        y += lineHeight
    }

    return canvas.toBuffer()
}
