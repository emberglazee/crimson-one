import { AttachmentBuilder, MessageFlags, SlashCommandBuilder, ContextMenuCommandBuilder, InteractionContextType, ApplicationCommandType } from 'discord.js'
import type { SlashCommand, ContextMenuCommand } from '../modules/CommandManager'
import { QuoteImageFactory } from '../modules/QuoteImageFactory'
import { type GradientType, COLORS, ROLE_COLORS } from '../util/colors'

export const slashCommand = {
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
        ).addBooleanOption(bo => bo
            .setName('interpretnewlines')
            .setDescription('Interpret <newline> as line breaks in text')
            .setRequired(false)
        ).addBooleanOption(so => so
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        let ephemeral = interaction.options.getBoolean('ephemeral', false), forcedEphemeral = false
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
        const interpretNewlines = interaction.options.getBoolean('interpretNewlines') ?? true

        // if (interaction.guildId === '311334325402599425') {
        //     ephemeral = true
        //     forcedEphemeral = true
        // }

        if (!color && gradient === 'none') {
            await interaction.reply({
                content: '❌ Either color/role color or gradient must be provided' + forcedEphemeral ? '\n-# ⚠️ Project Wingman server detected, forced ephemeral reply' : '',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        await interaction.deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
        const factory = QuoteImageFactory.getInstance()
        factory.setGuild(interaction.guild!)
        try {
            const result = await factory.createQuoteImage(speaker, quote, color, gradient, stretchGradient, 'ac7', interpretNewlines)
            await interaction.editReply({
                content: forcedEphemeral ? '-# ⚠️ Project Wingman server detected, forced ephemeral reply' : null,
                files: [
                    new AttachmentBuilder(result.buffer)
                        .setName(`quote.${result.type === 'image/gif' ? 'gif' : 'png'}`)
                ]
            })
        } catch (error) {
            await interaction.editReply('❌ Failed to generate quote image: ' + (error instanceof Error ? error.message : 'Unknown error') + forcedEphemeral ? '\n-# ⚠️ Project Wingman server detected, forced ephemeral reply' : '')
        }
    }
} satisfies SlashCommand

export const contextMenuCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Quick Ace Combat 7 subtitle')
        .setContexts(InteractionContextType.Guild),
    type: ApplicationCommandType.Message,
    async execute(interaction) {
        const speaker = interaction.targetMessage.author.displayName
        const color = interaction.targetMessage.member?.displayHexColor || '#3498db'
        const quote = interaction.targetMessage.content
        // const forcedEphemeral = interaction.guildId === '311334325402599425'
        const forcedEphemeral = false

        await interaction.deferReply({
            flags: forcedEphemeral ? MessageFlags.Ephemeral : undefined
        })
        const factory = QuoteImageFactory.getInstance()
        factory.setGuild(interaction.guild!)
        try {
            const result = await factory.createQuoteImage(speaker, quote, color, 'none', false, 'ac7', true)
            await interaction.editReply({ 
                files: [
                    new AttachmentBuilder(result.buffer)
                        .setName(`quote.${result.type === 'image/gif' ? 'gif' : 'png'}`)
                ]
            })
        } catch (error) {
            await interaction.editReply('❌ Failed to generate quote image: ' + (error instanceof Error ? error.message : 'Unknown error') + forcedEphemeral ? '\n-# ⚠️ Project Wingman server detected, forced ephemeral reply' : '')
        }
    }
} satisfies ContextMenuCommand<ApplicationCommandType.Message>
