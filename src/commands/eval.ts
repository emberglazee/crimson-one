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
        const { reply, deferReply, editReply, myId } = context

        const user = context.user
        if (user.id !== myId) {
            await reply('❌ You, solely, are responsible for this')
            return
        }

        await deferReply()

        const code = await context.getStringOption('code', true)
        try {
            const result = eval(code)
            const output = typeof result === 'string' ? result : inspect(result)
            await editReply(`\`\`\`js\n${output}\n\`\`\``)
        } catch (error) {
            await editReply(`\`\`\`js\n${error}\n\`\`\``)
        }
    }
} satisfies SlashCommand
