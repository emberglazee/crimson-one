import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import { SlashCommand } from '../types/types'
import { randRange } from '../util/functions'

const MAX_SIDES = 1000 // Prevent abuse with extremely large numbers
const MAX_ROLLS = 100 // Maximum number of rolls allowed

function rollDice(sides: number): { result: number; isNat: boolean } {
    const result = randRange(1, sides)
    return {
        result,
        isNat: result === 1 || result === sides
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Do a dice roll 🎲')
        .addNumberOption(no => no
            .setName('sides')
            .setDescription('Number of sides on the dice (default: 20)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(MAX_SIDES)
        ).addNumberOption(no => no
            .setName('rolls')
            .setDescription('Number of times to roll the dice (default: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(MAX_ROLLS)
        ).addStringOption(so => so
            .setName('action')
            .setDescription('What action is the roll for?')
            .setRequired(false)
        ).addUserOption(uo => uo
            .setName('user')
            .setDescription('Who is the roll for?')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction, { reply }) {
        try {
            const ephemeral = interaction.options.getBoolean('ephemeral', false)
            const user = interaction.options.getUser('user') ?? interaction.user

            const sides = interaction.options.getNumber('sides') ?? 20
            const rolls = interaction.options.getNumber('rolls') ?? 1
            const action = interaction.options.getString('action')

            const results = Array.from({ length: rolls }, () => rollDice(sides))
            const rollTexts = results.map(({ result, isNat }) => isNat ? `nat ${result}` : result.toString())
            const rollText = rollTexts.join(', ')

            const message = action
                ? `${user} rolls ${rollText} (🎲 ${rolls}d${sides}) for ${action}`
                : `${user} rolls ${rollText} (🎲 ${rolls}d${sides})`

            await reply({
                content: message,
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
        } catch (error: unknown) {
            console.error('Error in dice roll command:', error)
            await reply({
                content: '❌ An error occurred while rolling the dice. Please try again.',
                flags: MessageFlags.Ephemeral
            })
        }
    }
} satisfies SlashCommand
