import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { randRange } from '../util/functions'

const MAX_SIDES = 1000 // Prevent abuse with extremely large numbers

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
            const user = interaction.options.getUser('user') || interaction.user
            const channel = interaction.channel

            const sides = interaction.options.getNumber('sides') || 20
            const action = interaction.options.getString('action')
            const { result, isNat } = rollDice(sides)
            const rollText = isNat ? `nat ${result}` : result.toString()
            let message = action
                ? `${user} rolls ${rollText} (🎲 d${sides}) for ${action}`
                : `${user} rolls ${rollText} (🎲 d${sides})`
            if (channel?.id === '311334325402599425') {
                message += '\n-# dont spam the command here or else'
            }
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
