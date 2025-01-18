// command to write a project wingman styled subtitle in an ansi code block with colors
import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('pwquote')
        .setDescription('Generate a cool quote in the style of Project Wingman with an ANSI code block for colored text (doesnt work correctly yet)')
        .addStringOption(so => so
            .setName('speakername')
            .setDescription('The name of the speaker')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('quote')
            .setDescription('The quote to display')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('color')
            .setDescription('The theme color of the text (changes speaker name and color of the quotes "<<" and ">>")')
            .setRequired(true)
            .setChoices(
                ['gray', 'red', 'green', 'yellow', 'blue', 'pink', 'cyan'].map(color => { return { name: color, value: color }})
            )
        ),
    async execute(interaction) {
        /*
            working example:

            ```ansi
            [0;31mFederation Peacekeeper | Crimson 1
            [0;31m           << [0;37mPredictable. [0;31m>>
            ```

            extra spaces is to center the quote;
            pad the speaker name into the center if the quote is longer,
            or pad the quote into the center if the speaker name is longer;
            each character equals 2 spaces
        */
        /*
            -> [{format};{color}m <-

            keep format at 0(!)

            working colors:
            30 - gray
            31 - red
            32 - green
            33 - yellow
            34 - blue
            35 - pink
            36 - cyan
            37 - white (for quote text color)
        */
        const speakerName = interaction.options.getString('speakername', true)
        const quote = interaction.options.getString('quote', true)
        const color = interaction.options.getString('color', true) as 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'pink' | 'cyan'
        const colorCode = {
            gray: 30,
            red: 31,
            green: 32,
            yellow: 33,
            blue: 34,
            pink: 35,
            cyan: 36,
        }[color]
        const ansiColor = `[0;${colorCode}m`
        const ansiReset = '[0;37m'
        // align either the speaker name or the quote to the center by padding
        const totalLength = Math.max(speakerName.length, quote.length)
        const speakerNamePadding = Math.floor((totalLength - speakerName.length) / 2)
        const quotePadding = Math.floor((totalLength - quote.length) / 2)
        const speakerNameSpaces = ' '.repeat(speakerNamePadding)
        const quoteSpaces = ' '.repeat(quotePadding)
        const ansiText = `${speakerNameSpaces}${ansiColor}${speakerName}\n${quoteSpaces}${ansiColor}<< ${ansiReset}${quote} ${ansiColor}>>`
        await interaction.reply(`\`\`\`ansi\n${ansiText}\n\`\`\``)
    }
} satisfies SlashCommand
