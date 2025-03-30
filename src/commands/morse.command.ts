import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
import { PING_EMBERGLAZE } from '../util/constants'
const logger = new Logger('/morse')

export default {
    data: new SlashCommandBuilder()
        .setName('morse')
        .setDescription('Decode or encode text from or to morse code')
        .addSubcommand(sc => sc
            .setName('decode')
            .setDescription('Decode morse code into text')
            .addStringOption(so => so
                .setName('code')
                .setDescription('Morse code to attempt to decode')
            )
        ).addSubcommand(sc => sc
            .setName('encode')
            .setDescription('Encode text into morse code')
            .addStringOption(so => so
                .setName('text')
                .setDescription('text to encode into morse code')
            )
        ),
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand(true)
            const morse = await import('morse')
            let code, text = ''
            switch (subcommand) {
                case 'decode':
                    code = interaction.options.getString('code', true)
                    text = morse.decode(code)
                    await interaction.reply(text)
                    return
                case 'encode':
                    text = interaction.options.getString('text', true)
                    code = morse.encode(text)
                    await interaction.reply(code)
                    return
            }
        } catch (e) {
            const error = e as Error
            logger.error(error.stack ?? error.message ?? error)
            await interaction.reply(`${PING_EMBERGLAZE} something went wrong with the morse command -> \`${error.message ?? error}\`\n-# check the full error stack in the console, nerd`)
        }
    }
} satisfies SlashCommand
