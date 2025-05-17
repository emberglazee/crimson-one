import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command'),
    async execute(context) {
        const { reply } = context
        await reply('Test command executed')
    }
} satisfies SlashCommand
