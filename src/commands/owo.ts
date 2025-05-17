import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('owo')
        .setDescription('OwO-ify text')
        .addStringOption(so => so
            .setName('text')
            .setDescription('OwO what\'s this?')
            .setRequired(true)
        ),
    async execute(context) {
        const inputText = await context.getStringOption('text', true)
        const outputText = owoTranslate(inputText)

        if (outputText.length > 2000) {
            const buffer = Buffer.from(outputText, 'utf-8')
            const attachment = new AttachmentBuilder(buffer, { name: 'OwO.txt' })

            await context.reply({
                files: [attachment]
            })
        } else {
            await context.reply(outputText)
        }
    }
} satisfies SlashCommand

function owoTranslate(input: string): string {
    const replaceWords: Record<string, string> = {
        "love": "wuv",
        "mr": "mistuh",
        "dog": "doggo",
        "cat": "kitteh",
        "hello": "henwo",
        "hell": "heck",
        "fuck": "fwick",
        "fuk": "fwick",
        "shit": "shoot",
        "friend": "fwend",
        "stop": "stamp",
        "god": "gosh",
        "dick": "peepee",
        "penis": "peepee",
        "damn": "darn"
    }

    const prefixes = ["OwO", "hehe", "*nuzzles*", "*blushes*", "*giggles*", "*waises paw*", "OwO whats this?"]
    const suffixes = [":3", ">:3", "xox", ">3<", "UwU", "hehe", "r@^eJ", "(- • w •)", "(>• w •<)", "murr~", "(  • ⌒ •)", "(* ⌒Д⌒)", "(  ▁¡  ▁)", "(  • ω •)", "*gwomps*", "(＾ ω＾)"]

    // Replace words
    for (const [key, value] of Object.entries(replaceWords)) {
        const regex = new RegExp(`\\b${key}\\b`, "gi")
        input = input.replace(regex, value)
    }

    // R and L to W
    input = input.replace(/[rl]/g, "w").replace(/[RL]/g, "W")

    // Y after N with vowel
    input = input.replace(/n([aeiou])/gi, "ny$1")

    // Repeat words ending in Y
    input = input.replace(/(\b\w*y\b)/gi, "$1 $1")

    // Stuttering effect (10% chance per word)
    input = input.replace(/\b(\w)/g, match => Math.random() < 0.1 ? `${match}-${match}` : match)

    // Add a random prefix (10% chance)
    if (Math.random() < 0.1) {
        input = prefixes[Math.floor(Math.random() * prefixes.length)] + " " + input
    }

    // Add a random suffix (10% chance)
    if (Math.random() < 0.1) {
        input += " " + suffixes[Math.floor(Math.random() * suffixes.length)]
    }

    return input
}
