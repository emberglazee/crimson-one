// command to simulate drunk typing on the keyboard
import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('drunk')
        .setDescription('Simulate drunk typing on the keyboard')
        .addStringOption(so => so
            .setName('text')
            .setDescription('The text to drunkenly type')
            .setRequired(true)
        ).addBooleanOption(bo => bo
            .setName('ephermal')
            .setDescription('Should the message be ephermal?')
            .setRequired(false)
        ),
    async execute(interaction) {
        const inputText = interaction.options.getString('text', true)
        const outputText = drunkWrite(inputText)
        const isEphermal = interaction.options.getBoolean('ephermal') || false
        if (isEphermal) {
            await interaction.reply({ content: outputText, ephemeral: true })
        } else {
            await interaction.reply(outputText)
        }
    }
} satisfies SlashCommand

// Define the QWERTY keyboard layout
const qwertyLayout = {
    a: ['q', 'w', 's', 'z'], b: ['v', 'g', 'h', 'n'], c: ['x', 'd', 'f', 'v'],
    d: ['s', 'e', 'r', 'f', 'c', 'x'], e: ['w', 'r', 's', 'd'], f: ['d', 'r', 't', 'g', 'v', 'c'],
    g: ['f', 't', 'y', 'h', 'b', 'v'], h: ['g', 'y', 'u', 'j', 'n', 'b'],
    i: ['u', 'o', 'k', 'j'], j: ['h', 'u', 'i', 'k', 'n', 'm'], k: ['j', 'i', 'o', 'l', 'm'],
    l: ['k', 'o', 'p', ';'], m: ['n', 'j', 'k'], n: ['b', 'h', 'j', 'm'],
    o: ['i', 'p', 'l', 'k'], p: ['o', 'l', ';'], q: ['a', 'w'],
    r: ['e', 't', 'd', 'f'], s: ['a', 'w', 'e', 'd', 'x', 'z'],
    t: ['r', 'y', 'f', 'g'], u: ['y', 'i', 'h', 'j'], v: ['c', 'f', 'g', 'b'],
    w: ['q', 'e', 'a', 's'], x: ['z', 's', 'd', 'c'],
    y: ['t', 'u', 'g', 'h'], z: ['a', 's', 'x'],
    ',': ['m'], '.': [','], '/': ['.'], ';': ['l'],
    '[': ['p'], ']': ['['],
}

// Define special characters when Shift is held
const shiftSpecials = {
    ',': '<', '.': '>', '/': '?', ';': ':', "'": '"',
    '[': '{', ']': '}', '\\': '|', '`': '~',
}

function drunkWrite(inputText: string): string {
    function getRandomItem<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)]
    }

    return inputText.split('').map(char => {
        const lowerChar = char.toLowerCase()

        // Randomly mix case
        const isUpperCase = Math.random() < 0.05;
        const finalChar = isUpperCase ? lowerChar.toUpperCase() : lowerChar

        // Randomly hold shift for special characters
        if (shiftSpecials[char as keyof typeof shiftSpecials] && Math.random() < 0.3) {
            return shiftSpecials[char as keyof typeof shiftSpecials]
        }

        // Randomly replace with adjacent key
        if (qwertyLayout[lowerChar as keyof typeof qwertyLayout] && Math.random() < 0.1) {
            return getRandomItem(qwertyLayout[lowerChar as keyof typeof qwertyLayout])
        }

        // Return the potentially modified character
        return finalChar
    }).join('')
}
