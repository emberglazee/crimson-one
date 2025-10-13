import { SlashCommandBuilder, AttachmentBuilder, InteractionContextType } from 'discord.js'
import { SlashCommand } from '../types'
import { drunkWrite } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('drunk')
        .setDescription('Simulates drunk typing.')
        .addStringOption(option => option
            .setName('text')
            .setDescription('The text to type drunkenly.')
            .setRequired(true)
        ).setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        const inputText = ctx.getStringOption('text', true)
        const outputText = drunkWrite(inputText)

        if (outputText.length <= 2000) {
            await ctx.reply(outputText)
            return
        }
        const buffer = Buffer.from(outputText, 'utf-8')
        const attachment = new AttachmentBuilder(buffer, { name: 'drunk-text.txt' })

        await ctx.reply({
            files: [attachment]
        })
    }
} satisfies SlashCommand

