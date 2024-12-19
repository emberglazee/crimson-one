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

    function repeatChar(char: string): string {
        if (Math.random() < 0.1) {
            return char.repeat(Math.floor(Math.random() * 3) + 2)
        }
        return char
    }

    let result = ''
    let isShoutingMode = false
    
    for (let i = 0; i < inputText.length; i++) {
        const char = inputText[i]
        
        // Randomly enter/exit shouting mode
        if (Math.random() < 0.02) {
            isShoutingMode = !isShoutingMode
        }

        // Random extra spaces
        if (Math.random() < 0.08) {
            result += ' '.repeat(Math.floor(Math.random() * 2) + 1)
        }

        // Skip character (forget to type it)
        if (Math.random() < 0.03) {
            continue
        }

        const lowerChar = char.toLowerCase()

        // Apply case based on shouting mode or random uppercase
        const shouldBeUpper = isShoutingMode || Math.random() < 0.05
        const finalChar = shouldBeUpper ? lowerChar.toUpperCase() : lowerChar

        // Random shift specials
        if (shiftSpecials[char as keyof typeof shiftSpecials] && Math.random() < 0.3) {
            result += shiftSpecials[char as keyof typeof shiftSpecials]
            continue
        }

        // Random adjacent key
        if (qwertyLayout[lowerChar as keyof typeof qwertyLayout] && Math.random() < 0.1) {
            result += getRandomItem(qwertyLayout[lowerChar as keyof typeof qwertyLayout])
            continue
        }

        // Add potentially repeated character
        result += repeatChar(finalChar)
    }

    return result
}
