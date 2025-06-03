import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play Russian Roulette with a specified action')
        .addStringOption(so => so
            .setName('action')
            .setDescription('What happens if you lose (e.g., "timeout for 1 minute")')
            .setRequired(true)
        ),

    async execute(context) {
        await context.deferReply()

        const action = context.getStringOption('action', true)
        const user = await context.getUserOption('user', false, context.author)
        const chamber = Math.floor(Math.random() * 6) + 1

        if (chamber === 1) {
            await context.reply({
                content: `🔫 **BANG!** ${user} Predictable.\nConsequence|| (of power)||: ${action}`,
                allowedMentions: { users: [user.id] }
            })
        } else {
            await context.reply({
                content: `🔫 *click* - ${user} got lucky... Next time.\n-# Specified action was: ${action}`,
                allowedMentions: { users: [user.id] }
            })
        }
    }
} as SlashCommand
