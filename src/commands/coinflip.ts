import { SlashCommand } from '../types'
import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { getRandomElement } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flips a coin.')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        const result = getRandomElement(['Heads', 'Tails'])
        await ctx.reply(`🪙 The coin landed on: **${result}**`)
    }
} satisfies SlashCommand
