import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play Russian Roulette with a specified action')
        .addStringOption(option => option
            .setName('action')
            .setDescription('What happens if you lose (e.g., "timeout for 1 minute")')
        ),

    async execute(ctx) {
        await ctx.deferReply()

        const action = ctx.getStringOption('action')
        const user = await ctx.getUserOption('user', false, ctx.author)
        const chamber = Math.floor(Math.random() * 6) + 1

        if (chamber === 1) {
            await ctx.reply({
                content: `🔫 **BANG!** ${user} Predictable.` + (action ? `\nConsequence|| (of power)||: ${action}` : ''),
                allowedMentions: { users: [user.id] }
            })
        } else {
            await ctx.reply({
                content: `🔫 *click* - ${user} got lucky... Next time.` + (action ? `\n-# Specified action was: ${action}` : ''),
                allowedMentions: { users: [user.id] }
            })
        }
    }
} as SlashCommand
