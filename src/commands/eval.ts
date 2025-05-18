import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import { inspect } from 'util'

export default {
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('Evaluate JavaScript code')
        .addStringOption(option => option
            .setName('code')
            .setDescription('The code to evaluate')
            .setRequired(true)
        ),
    async execute(context) {

        if (context.user.id !== context.myId) {
            await context.reply('❌ You, solely, are responsible for this')
            return
        }

        await context.deferReply()

        const code = await context.getStringOption('code', true)
        try {
            const result = eval(code)
            const output = typeof result === 'string' ? result : inspect(result)
            await context.editReply(`\`\`\`js\n${output}\n\`\`\``)
        } catch (error) {
            await context.editReply(`\`\`\`js\n${error}\n\`\`\``)
        }
    }
} satisfies SlashCommand
