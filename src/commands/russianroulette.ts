import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play Russian Roulette with a specified action')
        .addStringOption(so => so
            .setName('action')
            .setDescription('What happens if you lose (e.g., "timeout for 1 minute")')
            .setRequired(true)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),

    async execute({ reply }, interaction) {
        const action = interaction.options.getString('action', true)
        const chamber = Math.floor(Math.random() * 6) + 1
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        if (chamber === 1) {
            await reply({
                content: `🔫 **BANG!** ${interaction.user} Predictable.\nConsequence|| (of power)||: ${action}`,
                allowedMentions: { users: [interaction.user.id] },
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
        } else {
            await reply({
                content: `🔫 *click* - ${interaction.user} got lucky... Next time.\n-# Specified action was: ${action}`,
                allowedMentions: { users: [interaction.user.id] },
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
        }
    }
} as SlashCommand
