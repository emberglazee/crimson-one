import { AttachmentBuilder, SlashCommandBuilder, ContextMenuCommandBuilder, InteractionContextType, ApplicationCommandType } from 'discord.js'
import { SlashCommand, ContextMenuCommand } from '../types'
import { QuoteImageFactory } from '../modules/QuoteImageFactory'
import { type GradientType, COLORS, ROLE_COLORS, CHARACTER_COLORS } from '../util/colors'

export const slashCommand = {
    data: new SlashCommandBuilder()
        .setName('subtitle')
        .setDescription('Generate an Ace Combat 7 or Project Wingman-styled subtitle image')
        .addStringOption(option => option
            .setName('style')
            .setDescription('The subtitle style to use')
            .setRequired(true)
            .setChoices(
                { name: 'Ace Combat 7', value: 'ac7' },
                { name: 'Project Wingman', value: 'pw' },
                { name: 'Ace Combat Zero', value: 'acz' },
                { name: 'Helldivers 2 (WIP)', value: 'hd2' }
            )
        ).addStringOption(option => option
            .setName('speaker')
            .setDescription('The name of the speaker')
            .setRequired(true)
        ).addStringOption(option => option
            .setName('text')
            .setDescription('The text to display')
            .setRequired(true)
        ).addStringOption(option => option
            .setName('color')
            .setDescription('The color of the speaker\'s name')
            .setRequired(false)
            .setChoices(
                COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(option => option
            .setName('role_color')
            .setDescription('Use a Discord role color for the speaker\'s name')
            .setRequired(false)
            .setChoices(
                ROLE_COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(option => option
            .setName('character_color')
            .setDescription('Use a character color for the speaker\'s name')
            .setRequired(false)
            .setChoices(
                CHARACTER_COLORS.map(color => ({ name: color.name, value: color.name }))
            )
        ).addStringOption(option => option
            .setName('gradient')
            .setDescription('Apply a gradient effect to the speaker\'s name')
            .setRequired(false)
            .setChoices(
                { name: 'Trans Flag', value: 'trans' },
                { name: 'Rainbow', value: 'rainbow' },
                { name: 'Italian Flag', value: 'italian' },
                { name: 'French Flag', value: 'french' }
            )
        ).addBooleanOption(option => option
            .setName('stretch')
            .setDescription('Stretch the gradient across the entire name instead of repeating it')
            .setRequired(false)
        ).addBooleanOption(option => option
            .setName('continuous_gradient')
            .setDescription('Make the gradient continuous across multiple lines of the speaker\'s name')
            .setRequired(false)
        ).addBooleanOption(option => option
            .setName('interpret_newlines')
            .setDescription('Convert <newline> tags into line breaks')
            .setRequired(false)
        ),
    async execute(ctx) {
        const style = (ctx.getStringOption('style', true)) as 'ac7' | 'pw' | 'acz' | 'hd2'
        const speaker = ctx.getStringOption('speaker', true)
        const text = ctx.getStringOption('text', true)
        const gradient = (ctx.getStringOption('gradient', false, 'none')) as GradientType
        const roleColor = ctx.getStringOption('role_color')
        const plainColor = ctx.getStringOption('color')
        const characterColor = ctx.getStringOption('character_color')
        const color = roleColor
            ? ROLE_COLORS.find(c => c.name === roleColor)?.hex ?? null
            : plainColor
                ? COLORS.find(c => c.name === plainColor)?.hex ?? null
                : characterColor
                    ? CHARACTER_COLORS.find(c => c.name === characterColor)?.hex ?? null
                    : null
        const stretchGradient = ctx.getBooleanOption('stretch', false)
        const continuousGradient = ctx.getBooleanOption('continuous_gradient', false)
        const interpretNewlines = ctx.getBooleanOption('interpret_newlines', false)

        if (!color && gradient === 'none') {
            await ctx.reply('❌ You must provide either a color, role color, character color, or a gradient color')
            return
        }

        await ctx.deferReply()
        const factory = QuoteImageFactory.getInstance()
            .setGuild(ctx.guild!)
        try {
            const result = await factory.createQuoteImage(speaker, text, color, gradient, stretchGradient ?? false, style, interpretNewlines ?? false, continuousGradient ?? false)
            await ctx.editReply({
                files: [
                    new AttachmentBuilder(result.buffer)
                        .setName(`subtitle.${result.type === 'image/gif' ? 'gif' : 'png'}`)
                ]
            })
        } catch (error) {
            await ctx.editReply('❌ Failed to generate subtitle image: ' + (error instanceof Error ? error.message : 'Unknown error'))
        }
    }
} satisfies SlashCommand

export const contextMenuCommandAC7 = {
    data: new ContextMenuCommandBuilder()
        .setName('Quick Ace Combat 7 subtitle')
        .setContexts(InteractionContextType.Guild),
    type: ApplicationCommandType.Message,
    async execute({ deferReply, editReply, guild }, interaction) {
        const speaker = interaction.targetMessage.member?.displayName ?? interaction.targetMessage.author.displayName
        const color = interaction.targetMessage.member?.displayHexColor || '#3498db'
        const text = interaction.targetMessage.content

        await deferReply()
        const factory = QuoteImageFactory.getInstance()
            .setGuild(guild!)
        try {
            const result = await factory.createQuoteImage(speaker, text, color, 'none', false, 'ac7', true)
            await editReply({
                files: [
                    new AttachmentBuilder(result.buffer)
                        .setName(`subtitle.${result.type === 'image/gif' ? 'gif' : 'png'}`)
                ]
            })
        } catch (error) {
            await editReply('❌ Failed to generate subtitle image: ' + (error instanceof Error ? error.message : 'Unknown error'))
        }
    }
} satisfies ContextMenuCommand<ApplicationCommandType.Message>

export const contextMenuCommandPW = {
    data: new ContextMenuCommandBuilder()
        .setName('Quick Project Wingman subtitle')
        .setContexts(InteractionContextType.Guild),
    type: ApplicationCommandType.Message,
    async execute({ deferReply, editReply, guild }, interaction) {
        const speaker = interaction.targetMessage.member?.displayName ?? interaction.targetMessage.author.displayName
        const color = interaction.targetMessage.member?.displayHexColor || '#3498db'
        const text = interaction.targetMessage.content

        await deferReply()
        const factory = QuoteImageFactory.getInstance()
            .setGuild(guild!)
        try {
            const result = await factory.createQuoteImage(speaker, text, color, 'none', false, 'pw', true)
            await editReply({
                files: [
                    new AttachmentBuilder(result.buffer)
                        .setName(`subtitle.${result.type === 'image/gif' ? 'gif' : 'png'}`)
                ]
            })
        } catch (error) {
            await editReply('❌ Failed to generate subtitle image: ' + (error instanceof Error ? error.message : 'Unknown error'))
        }
    }
} satisfies ContextMenuCommand<ApplicationCommandType.Message>

export const contextMenuCommandHD2 = {
    data: new ContextMenuCommandBuilder()
        .setName('Quick Helldivers 2 subtitle')
        .setContexts(InteractionContextType.Guild),
    type: ApplicationCommandType.Message,
    async execute({ deferReply, editReply, guild }, interaction) {
        const speaker = interaction.targetMessage.member?.displayName ?? interaction.targetMessage.author.displayName
        const color = interaction.targetMessage.member?.displayHexColor || '#3498db'
        const text = interaction.targetMessage.content

        await deferReply()
        const factory = QuoteImageFactory.getInstance()
            .setGuild(guild!)
        try {
            // TODO: Implement proper HD2 subtitle format
            const result = await factory.createQuoteImage(speaker, text, color, 'none', false, 'hd2', true)
            await editReply({
                files: [
                    new AttachmentBuilder(result.buffer)
                        .setName(`subtitle.${result.type === 'image/gif' ? 'gif' : 'png'}`)
                ]
            })
        } catch (error) {
            await editReply('❌ Failed to generate subtitle image: ' + (error instanceof Error ? error.message : 'Unknown error'))
        }
    }
} satisfies ContextMenuCommand<ApplicationCommandType.Message>
