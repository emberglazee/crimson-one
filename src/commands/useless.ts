import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('useless')
        .setDescription('Useless.'),
    async execute() {
        // This command does nothing, not even reply.
    }
} satisfies SlashCommand
