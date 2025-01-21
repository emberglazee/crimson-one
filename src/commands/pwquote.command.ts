import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { createCanvas, registerFont } from 'canvas'
import path from 'path'

const fontPath = path.join(__dirname, '../../data/Roboto.ttf')
registerFont(fontPath, { family: 'Roboto' })

export default {
    data: new SlashCommandBuilder()
        .setName('pwquote')
        .setDescription('Generate a cool quote in the style of Project Wingman with an image for colored text')
        .addStringOption(so => so
            .setName('speakername')
            .setDescription('The name of the speaker')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('quote')
            .setDescription('The quote to display')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('color')
            .setDescription('The theme color of the text (changes speaker name and color of the quotes "<<" and ">>")')
            .setRequired(true)
            .setChoices(
                ['gray', 'red', 'green', 'yellow', 'blue', 'pink', 'cyan'].map(color => { return { name: color, value: color }})
            )
        ),
    async execute(interaction) {
        const speaker = interaction.options.getString('speakername', true)
        const quote = interaction.options.getString('quote', true)
        const color = interaction.options.getString('color', true) as 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'pink' | 'cyan'
        const image = createQuoteImage(speaker, quote, color)
        await interaction.reply({ files: [image] })
    }
} satisfies SlashCommand

function createQuoteImage(speaker: string, quote: string, color: 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'pink' | 'cyan') {
    const width = 1000
    const height = 300
    const fontSize = 48

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

    ctx.fillStyle = speakerColor
    ctx.fillText(speaker, width / 2, 50)

    ctx.fillStyle = 'white'
    ctx.fillText(quote, width / 2, 150)

    return canvas.toBuffer()
}
