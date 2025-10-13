import { SlashCommandBuilder, AttachmentBuilder, InteractionContextType } from 'discord.js'
import { SlashCommand } from '../types'
import { owoTranslate } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('owo')
        .setDescription('OwO-ifies text')
        .addStringOption(option => option.setName('text').setDescription('Text to OwOify').setRequired(true))
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        const inputText = ctx.getStringOption('text', true)
        const outputText = owoTranslate(inputText)

        if (outputText.length > 2000) {
            const buffer = Buffer.from(outputText, 'utf-8')
            const attachment = new AttachmentBuilder(buffer, { name: 'OwO.txt' })

            await ctx.reply({
                files: [attachment]
            })
        } else {
            await ctx.reply(outputText)
        }
    }
} satisfies SlashCommand
