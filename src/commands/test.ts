import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command'),
    async execute(context) {
        const isAnInteraction = context.interaction !== undefined
        const isUserInstalled = isAnInteraction && context.guild?.members.cache.get(context.client.user!.id) !== undefined // user install implies interaction context
        await context.reply(`Test command executed\n-# - Context: ${isAnInteraction ? 'Interaction' : 'Message'}; User-installed: ${isUserInstalled ? 'Probably' : 'Probably not'}`)
    }
} satisfies SlashCommand
