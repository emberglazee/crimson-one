import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { inspect } from 'util'

export default {
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('Evaluates JavaScript code (bot owner only).')
        .addStringOption(option => option
            .setName('code')
            .setDescription('The code to evaluate')
            .setRequired(true)
        ).setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        if (!(await ctx.checkEmbi())) return

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
