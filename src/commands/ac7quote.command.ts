import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { createQuoteImage } from '../util/functions'
import { type ColorName, type GradientType, COLORS, ROLE_COLORS } from '../util/colors'

export default {
    data: new SlashCommandBuilder()
        .setName('ac7quote')
        .setDescription('Generate an image out of a text and speaker name styled as an Ace Combat 7 subtitle')
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
        const roleColor = interaction.options.getString('rolecolor')
        const plainColor = interaction.options.getString('color')
        const color = roleColor 
            ? ROLE_COLORS.find(c => c.name === roleColor)?.hex ?? null
            : plainColor 
                ? COLORS.find(c => c.name === plainColor)?.hex ?? null
                : null
        const stretchGradient = interaction.options.getBoolean('stretch') ?? false
        
        if (!color && gradient === 'none') {
            await interaction.reply('❌ Either color/role color or gradient must be provided')
            return
        }
        
        await interaction.deferReply()
        const image = await createQuoteImage(speaker, quote, color, gradient, stretchGradient, 'ac7')
        await interaction.editReply({ files: [image] })
    }
} satisfies SlashCommand
