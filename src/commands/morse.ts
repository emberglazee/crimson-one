import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
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
    async execute(context) {
        try {
            const subcommand = context.getSubcommand(true)
            const morse = await import('morse')
            let code, text = ''
            switch (subcommand) {
                case 'decode':
                    code = context.getStringOption('code', true)
                    text = morse.decode(code)
                    await context.reply(text)
                    return
                case 'encode':
                    text = context.getStringOption('text', true)
                    code = morse.encode(text)
                    await context.reply(code)
                    return
            }
        } catch (e) {
            const error = e as Error
            logger.warn(error.stack ?? error.message ?? error)
            await context.reply(`${PING_EMBERGLAZE} something went wrong with the morse command -> \`${error.message ?? error}\`\n-# check the full error stack in the console, nerd`)
        }
    }
} satisfies SlashCommand
