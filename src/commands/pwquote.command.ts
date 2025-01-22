import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { createCanvas, registerFont } from 'canvas'
import { type ColorName, type GradientType, COLORS, ROLE_COLORS, TRANS_COLORS, RAINBOW_COLORS, ITALIAN_COLORS } from '../util/colors'
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
            .setDescription('Speaker name color')
            .setRequired(false)
            .setChoices(
                COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(so => so
            .setName('rolecolor')
            .setDescription('Pick a discord role color for speaker instead of a predefined color')
            .setRequired(false)
            .setChoices(
                ROLE_COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(so => so
            .setName('gradient')
            .setDescription('Use gradient colors for speaker name')
            .setRequired(false)
            .setChoices(
                { name: 'Trans Flag', value: 'trans' },
                { name: 'Rainbow', value: 'rainbow' },
                { name: 'Italian Flag', value: 'italian' }
            )
        ).addBooleanOption(bo => bo
            .setName('stretch')
            .setDescription('Stretch gradient across entire name instead of repeating')
            .setRequired(false)
        ),
    async execute(interaction) {
        const speaker = interaction.options.getString('speaker', true)
        const quote = interaction.options.getString('quote', true)
        const gradient = (interaction.options.getString('gradient') ?? 'none') as GradientType
        const color = (interaction.options.getString('color') || interaction.options.getString('rolecolor')) as ColorName | null
        const stretchGradient = interaction.options.getBoolean('stretch') ?? false

        if (!color && gradient === 'none') {
            await interaction.reply('❌ Either color/role color or gradient must be provided')
            return
        }
        
        await interaction.deferReply()
        const image = createQuoteImage(speaker, quote, color, gradient, stretchGradient)
        await interaction.editReply({ files: [image] })
    }
} satisfies SlashCommand

function createQuoteImage(speaker: string, quote: string, color: ColorName | null, gradient: GradientType, stretchGradient = false) {
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

    const speakerColor = color ? (COLORS.find(c => c.name === color)?.hex || ROLE_COLORS.find(c => c.name === color)?.hex || '#FFFFFF') : '#FFFFFF'

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
        const gradientColors = gradient === 'trans' ? TRANS_COLORS 
            : gradient === 'rainbow' ? RAINBOW_COLORS 
            : ITALIAN_COLORS
        for (const line of speakerLines) {
            let x = width / 2 - ctx.measureText(line).width / 2
            for (let i = 0; i < line.length; i++) {
                const char = line[i]
                const colorIndex = stretchGradient 
                    ? Math.floor((i / line.length) * gradientColors.length)
                    : i % gradientColors.length
                ctx.fillStyle = gradientColors[colorIndex]
                ctx.textAlign = 'left'
                const charWidth = ctx.measureText(char).width
                ctx.fillText(char, x, y)
                x += charWidth
            }
            y += lineHeight
        }
        ctx.textAlign = 'center'
    }

    ctx.fillStyle = 'white'
    y += 2
    for (const line of quoteLines) {
        ctx.fillText(line, width / 2, y)
        y += lineHeight
    }

    return canvas.toBuffer()
}
