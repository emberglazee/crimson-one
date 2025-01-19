import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play Russian Roulette with a specified action')
        .addStringOption(so => so
            .setName('action')
            .setDescription('What happens if you lose (e.g., "timeout for 1 minute")')
            .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const action = interaction.options.getString('action', true)
        const chamber = Math.floor(Math.random() * 6) + 1

        if (chamber === 1) {
            await interaction.reply({
                content: `🔫 **BANG!** ${interaction.user} lost the game of roulette!\nConsequence: ${action}`,
                allowedMentions: { users: [interaction.user.id] }
            })
        } else {
            await interaction.reply({
                content: `🔫 *click* - ${interaction.user} lives to play another day.`,
                allowedMentions: { users: [interaction.user.id] }
            })
        }
    }
} as SlashCommand
