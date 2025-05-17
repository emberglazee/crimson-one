import { SlashCommandBuilder, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import { randRange } from '../util/functions'

const MAX_SIDES = 1000 // Prevent abuse with extremely large numbers
const MAX_ROLLS = 100 // Maximum number of rolls allowed
const MAX_ITERATIONS = 1000 // Maximum number of rolls allowed for 'until'
const MAX_UNTIL_SIDES = 100 // Max sides for 'until' subcommand

function rollDice(sides: number): { result: number; isNat: boolean } {
    const result = randRange(1, sides)
    return {
        result,
        isNat: result === 1 || result === sides
    }
}

function addCommonRollOptions(sc: SlashCommandSubcommandBuilder) {
    return sc
        .addNumberOption(no => no
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
        )
}

export default {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Do a dice roll 🎲')
        .addSubcommand(sc => {
            sc.setName('custom')
                .setDescription('Roll a custom dice')
                .addNumberOption(no => no
                    .setName('sides')
                    .setDescription('Number of sides on the dice')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(MAX_SIDES)
                )
            return addCommonRollOptions(sc)
        })
        .addSubcommand(sc => addCommonRollOptions(sc.setName('d6').setDescription('Roll a d6 dice')))
        .addSubcommand(sc => addCommonRollOptions(sc.setName('d20').setDescription('Roll a d20 dice')))
        .addSubcommand(sc => addCommonRollOptions(sc.setName('d100').setDescription('Roll a d100 dice')))
        .addSubcommand(sc =>
            sc.setName('until')
                .setDescription('Roll dice until you get a specific number 🎲')
                .addNumberOption(no => no
                    .setName('number')
                    .setDescription('The number to roll until (required)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(MAX_UNTIL_SIDES)
                )
                .addNumberOption(no => no
                    .setName('sides')
                    .setDescription('Number of sides on the dice (required)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(MAX_UNTIL_SIDES)
                )
                .addBooleanOption(bo => bo
                    .setName('ephemeral')
                    .setDescription('Should the response only show up for you?')
                    .setRequired(false)
                )
        ),
    async execute({ reply }, interaction) {
        const subcommand = interaction.options.getSubcommand(true)
        if (subcommand === 'until') {
            // /roll until logic
            const ephemeral = interaction.options.getBoolean('ephemeral') ?? false
            const targetNumber = interaction.options.getNumber('number', true)
            const sides = interaction.options.getNumber('sides', true)
            if (targetNumber > sides) {
                await reply({
                    content: `❌ The target number (${targetNumber}) cannot be greater than the number of sides (${sides})!`,
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                return
            }
            let rolls = 0
            let result
            const rollHistory = []
            const startTime = process.hrtime()
            do {
                result = randRange(1, sides)
                rollHistory.push(result)
                rolls++
            } while (result !== targetNumber && rolls < MAX_ITERATIONS)
            const endTime = process.hrtime(startTime)
            const duration = endTime[0] * 1000 + endTime[1] / 1000000
            const message = rolls === MAX_ITERATIONS
                ? `🎲 Rolled ${rolls} times and never got ${targetNumber} on a d${sides} in ${duration}ms! Here are the last 10 rolls: ${rollHistory.slice(-10).join(', ')}`
                : `🎲 Got ${targetNumber} on a d${sides} after ${rolls} rolls in ${duration}ms! Here are the last 10 rolls: ${rollHistory.slice(-10).join(', ')}`
            await reply({
                content: message,
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        const user = interaction.options.getUser('user') ?? interaction.user
        const rolls = interaction.options.getNumber('rolls') ?? 1
        const action = interaction.options.getString('action')

        let sides: number
        switch (subcommand) {
            case 'custom':
                sides = interaction.options.getNumber('sides', true)
                break
            case 'd6':
                sides = 6
                break
            case 'd20':
                sides = 20
                break
            case 'd100':
                sides = 100
                break
            default:
                throw new Error('Unknown subcommand')
        }

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
    }
} satisfies SlashCommand
