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
        const action = await context.getStringOption('action', true)
        const chamber = Math.floor(Math.random() * 6) + 1

        if (chamber === 1) {
            await context.reply({
                content: `🔫 **BANG!** ${context.user} Predictable.\nConsequence|| (of power)||: ${action}`,
                allowedMentions: { users: [context.user.id] }
            })
        } else {
            await context.reply({
                content: `🔫 *click* - ${context.user} got lucky... Next time.\n-# Specified action was: ${action}`,
                allowedMentions: { users: [context.user.id] }
            })
        }
    }
} as SlashCommand
