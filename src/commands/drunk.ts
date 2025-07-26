import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { chance } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('drunk')
        .setDescription('Simulate drunk typing on the keyboard')
        .addStringOption(so => so
            .setName('text')
            .setDescription('The text to drunkenly type')
            .setRequired(true)
        ),
    async execute(context) {
        const inputText = context.getStringOption('text', true)
        const outputText = drunkWrite(inputText)

        if (outputText.length <= 2000) {
            await context.reply(outputText)
            return
        }
        const buffer = Buffer.from(outputText, 'utf-8')
        const attachment = new AttachmentBuilder(buffer, { name: 'drunk-text.txt' })

        await context.reply({
            files: [attachment]
        })
    }
} satisfies SlashCommand

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

const jcukenLayout = {
    'а': ['ф', 'ы', 'в'], 'б': ['ь', 'в', 'н'], 'в': ['а', 'ы', 'п', 'ф'],
    'г': ['п', 'р', 'о', 'л'], 'д': ['л', 'ж', 'э'], 'е': ['к', 'н', 'г'],
    'ё': ['э', 'ж', 'е'], 'ж': ['д', 'э', 'х', '.'], 'з': ['щ', 'д', 'х'],
    'и': ['у', 'ш', 'щ'], 'й': ['ц', 'у', 'к'], 'к': ['у', 'е', 'н'],
    'л': ['о', 'р', 'д', 'ж'], 'м': ['и', 'т', 'ь'], 'н': ['е', 'г', 'р'],
    'о': ['л', 'д', 'ж'], 'п': ['р', 'а', 'в'], 'р': ['п', 'к', 'в'],
    'с': ['ч', 'м', 'и'], 'т': ['ь', 'б', 'ю'], 'у': ['ц', 'к', 'е'],
    'ф': ['ы', 'в', 'а'], 'х': ['з', '.', 'ъ'], 'ц': ['й', 'у', 'к'],
    'ч': ['с', 'м', 'и'], 'ш': ['щ', 'з', 'х'], 'щ': ['ш', 'з', 'х'],
    'ъ': ['х', 'ж', 'э'], 'ы': ['ф', 'в', 'а'], 'ь': ['т', 'б', 'ю'],
    'э': ['ж', 'д', 'л'], 'ю': ['б', 'ь', '.'], 'я': ['ч', 'с', 'м'],
}

// Define special characters when Shift is held
const shiftSpecials = {
    ',': '<', '.': '>', '/': '?', ';': ':', "'": '"',
    '[': '{', ']': '}', '\\': '|', '`': '~',
}

function isRussianText(text: string): boolean {
    const russianChars = /[а-яА-ЯёЁ]/
    return russianChars.test(text)
}

function drunkWrite(inputText: string): string {
    const MAX_EXTRA_SPACES = 2
    const MAX_REPEATS = 3

    // In percentages
    const REPEAT_CHAR_CHANCE = 10
    const SHOUTING_MODE_TOGGLE_CHANCE = 2
    const EXTRA_SPACE_CHANCE = 8
    const SKIP_CHAR_CHANCE = 3
    const RANDOM_UPPERCASE_CHANCE = 5
    const SHIFT_SPECIALS_CHANCE = 30
    const ADJACENT_KEY_CHANCE = 10

    function getRandomItem<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)]
    }

    function repeatChar(char: string): string {
        if (chance(REPEAT_CHAR_CHANCE)) {
            return char.repeat(Math.floor(Math.random() * MAX_REPEATS) + 2)
        }
        return char
    }

    let result = ''
    let isShoutingMode = false
    const isRussian = isRussianText(inputText)
    const layoutMap = isRussian ? jcukenLayout : qwertyLayout

    for (let i = 0; i < inputText.length; i++) {
        const char = inputText[i]

        // Randomly enter/exit shouting mode
        if (chance(SHOUTING_MODE_TOGGLE_CHANCE)) isShoutingMode = !isShoutingMode

        // Random extra spaces
        if (chance(EXTRA_SPACE_CHANCE)) result += ' '.repeat(Math.floor(Math.random() * MAX_EXTRA_SPACES) + 1)

        // Skip character (forget to type it)
        if (chance(SKIP_CHAR_CHANCE)) continue

        const lowerChar = char.toLowerCase()

        // Apply case based on shouting mode or random uppercase
        const shouldBeUpper = isShoutingMode || chance(RANDOM_UPPERCASE_CHANCE)
        const finalChar = shouldBeUpper ? lowerChar.toUpperCase() : lowerChar

        // Random shift specials (only for non-Russian text)
        if (!isRussian && shiftSpecials[char as keyof typeof shiftSpecials] && chance(SHIFT_SPECIALS_CHANCE)) {
            result += shiftSpecials[char as keyof typeof shiftSpecials]
            continue
        }

        // Random adjacent key
        if (layoutMap[lowerChar as keyof typeof layoutMap] && chance(ADJACENT_KEY_CHANCE)) {
            result += getRandomItem(layoutMap[lowerChar as keyof typeof layoutMap])
            continue
        }

        // Add potentially repeated character
        result += repeatChar(finalChar)
    }

    return result
}
