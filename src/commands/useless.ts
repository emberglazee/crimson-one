import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('useless')
        .setDescription('Useless.'),
    async execute() {
        // literally nothing. not even a reply. ive been asked to do this so i did it
    }
} satisfies SlashCommand
