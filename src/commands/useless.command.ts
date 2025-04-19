import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('useless')
        .setDescription('Useless.'),
    async execute() {
        // literally nothing. not even a reply
    }
} satisfies SlashCommand
