import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import { randRange } from '../util/functions'

const MAX_SIDES = 100 // Prevent abuse with extremely large numbers
const MAX_ITERATIONS = 1000 // Maximum number of rolls allowed

function rollDice(sides: number): number {
    return randRange(1, sides)
}

export default {
    data: new SlashCommandBuilder()
        .setName('rolluntil')
        .setDescription('Roll dice until you get a specific number 🎲')
        .addNumberOption(no => no
            .setName('number')
            .setDescription('The number to roll until (required)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_SIDES)
        ).addNumberOption(no => no
            .setName('sides')
            .setDescription('Number of sides on the dice (default: 20)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(MAX_SIDES)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute({ deferReply, editReply }, interaction) {
        try {
            const ephemeral = interaction.options.getBoolean('ephemeral') ?? false
            await deferReply({ ephemeral })

            const targetNumber = interaction.options.getNumber('number', true)
            const sides = interaction.options.getNumber('sides') ?? 20

            if (targetNumber > sides) {
                await editReply({
                    content: `❌ The target number (${targetNumber}) cannot be greater than the number of sides (${sides})!`
                })
                return
            }

            let rolls = 0
            let result: number
            const rollHistory: number[] = []

            do {
                result = rollDice(sides)
                rollHistory.push(result)
                rolls++
            } while (result !== targetNumber && rolls < MAX_ITERATIONS)

            const message = rolls === MAX_ITERATIONS
                ? `🎲 Rolled ${rolls} times and never got ${targetNumber} on a d${sides}! Here are the last 10 rolls: ${rollHistory.slice(-10).join(', ')}`
                : `🎲 Got ${targetNumber} on a d${sides} after ${rolls} rolls! Here are the last 10 rolls: ${rollHistory.slice(-10).join(', ')}`

            await editReply({ content: message })
        } catch (error: unknown) {
            console.error('Error in rolluntil command:', error)
            await editReply({
                content: '❌ An error occurred while rolling the dice. Please try again.'
            })
        }
    }
} satisfies SlashCommand
