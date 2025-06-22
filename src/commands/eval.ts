import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { inspect } from 'util'

export default {
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('Evaluate JavaScript code')
        .addStringOption(so => so
            .setName('code')
            .setDescription('The code to evaluate')
            .setRequired(true)
        ),
    async execute(context) {
        if (!context.isEmbi) {
            await context.reply('❌ You, solely, are responsible for this.')
            return
        }

        await context.deferReply()

        try {
            const code = context.getStringOption('code', true)
            const result = eval(code)
            const output = typeof result === 'string' ? result : inspect(result)
            await context.editReply(`\`\`\`js\n${output}\n\`\`\``)
        } catch (error) {
            await context.editReply(`\`\`\`js\n${error}\n\`\`\``)
        }
    }
} satisfies SlashCommand
