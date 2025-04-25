import { AttachmentBuilder, SlashCommandBuilder, MessageFlags, ContextMenuCommandBuilder, InteractionContextType, ApplicationCommandType } from 'discord.js'
import type { ContextMenuCommand, SlashCommand } from '../modules/CommandManager'
import { QuoteImageFactory } from '../modules/QuoteImageFactory'
import { type GradientType, COLORS, ROLE_COLORS } from '../util/colors'

export const slashCommand = {
    data: new SlashCommandBuilder()
        .setName('pwquote')
        .setDescription('Generate a Project Wingman-styled subtitle image with custom text and speaker')
        .addStringOption(so => so
            .setName('speaker')
            .setDescription('The name of the speaker')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('quote')
            .setDescription('The text to display')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('color')
            .setDescription('The color of the speaker\'s name')
            .setRequired(false)
            .setChoices(
                COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(so => so
            .setName('rolecolor')
            .setDescription('Use a Discord role color for the speaker\'s name')
            .setRequired(false)
            .setChoices(
                ROLE_COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(so => so
            .setName('gradient')
            .setDescription('Apply a gradient effect to the speaker\'s name')
            .setRequired(false)
            .setChoices(
                { name: 'Trans Flag', value: 'trans' },
                { name: 'Rainbow', value: 'rainbow' },
                { name: 'Italian Flag', value: 'italian' },
                { name: 'French Flag', value: 'french' }
            )
        ).addBooleanOption(bo => bo
            .setName('stretch')
            .setDescription('Stretch the gradient across the entire name instead of repeating it')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('interpretnewlines')
            .setDescription('Convert <newline> tags into line breaks')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Make the response visible only to you')
            .setRequired(false)
        ),
    async execute(interaction, { reply, deferReply, editReply }) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
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
        if (!color && gradient === 'none') {
            await reply({
                content: '❌ You must provide either a color/role color or a gradient effect',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        await deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
        const factory = QuoteImageFactory.getInstance()
        factory.setGuild(interaction.guild!)
        try {
            const result = await factory.createQuoteImage(speaker, quote, color, gradient, stretchGradient, 'pw', interpretNewlines)
            const attachment = new AttachmentBuilder(result.buffer).setName(`quote.${result.type === 'image/gif' ? 'gif' : 'png'}`)
            await editReply({
                files: [attachment]
            })
        } catch (error) {
            await editReply('❌ Failed to generate quote image: ' + (error instanceof Error ? error.message : 'Unknown error'))
        }
    }
} satisfies SlashCommand

export const contextMenuCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Quick Project Wingman subtitle')
        .setContexts(InteractionContextType.Guild),
    type: ApplicationCommandType.Message,
    async execute(interaction, { deferReply, editReply }) {
        const speaker = interaction.targetMessage.member?.displayName || interaction.targetMessage.author.displayName
        const color = interaction.targetMessage.member?.displayHexColor || '#3498db'
        const quote = interaction.targetMessage.content

        await deferReply()
        const factory = QuoteImageFactory.getInstance()
        factory.setGuild(interaction.guild!)
        try {
            const result = await factory.createQuoteImage(speaker, quote, color, 'none', false, 'pw', true)
            await editReply({
                files: [
                    new AttachmentBuilder(result.buffer)
                        .setName(`quote.${result.type === 'image/gif' ? 'gif' : 'png'}`)
                ]
            })
        } catch (error) {
            await editReply('❌ Failed to generate quote image: ' + (error instanceof Error ? error.message : 'Unknown error'))
        }
    }
} satisfies ContextMenuCommand<ApplicationCommandType.Message>
