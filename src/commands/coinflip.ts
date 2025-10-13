import { SlashCommand } from '../types'
import { SlashCommandBuilder } from 'discord.js'
import { getRandomElement } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flips a coin.'),
    async execute(ctx) {
        const result = getRandomElement(['Heads', 'Tails'])
        await ctx.reply(`🪙 The coin landed on: **${result}**`)
    }
} satisfies SlashCommand
