import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { inspect } from 'util'

export default {
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('Evaluates JavaScript code (owner only).')
        .addStringOption(option => option
            .setName('code')
            .setDescription('The code to evaluate')
            .setRequired(true)
        ),
    async execute(ctx) {
        try { await ctx.assertEmbi() } catch { return }

        await ctx.deferReply()

        try {
            const code = ctx.getStringOption('code', true)
            const result = eval(code)
            const output = typeof result === 'string' ? result : inspect(result)
            await ctx.editReply(`\`\`\`js\n${output}\n\`\`\``)
        } catch (error) {
            await ctx.editReply(`\`\`\`js\n${error}\n\`\`\``)
        }
    }
} satisfies SlashCommand
