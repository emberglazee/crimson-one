import { Logger } from '../modules/Logger'
const logger = new Logger('/morse')

import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { PING_EMBI } from '../util/constants'
import morse from 'morse'

export default {
    data: new SlashCommandBuilder()
        .setName('morse')
        .setDescription('Decode or encode text from or to morse code')
        .addSubcommand(subcommand => subcommand
            .setName('decode')
            .setDescription('Decode morse code into text')
            .addStringOption(option => option
                .setName('code')
                .setDescription('Morse code to attempt to decode')
            )
        ).addSubcommand(subcommand => subcommand
            .setName('encode')
            .setDescription('Encode text into morse code')
            .addStringOption(option => option
                .setName('text')
                .setDescription('text to encode into morse code')
            )
        ),
    async execute(ctx) {
        try {
            const subcommand = ctx.getSubcommand(true)
            let code, text = ''
            switch (subcommand) {
                case 'decode':
                    code = ctx.getStringOption('code', true)
                    text = morse.decode(code)
                    await ctx.reply(text)
                    return
                case 'encode':
                    text = ctx.getStringOption('text', true)
                    code = morse.encode(text)
                    await ctx.reply(code)
                    return
            }
        } catch (e) {
            const error = e as Error
            logger.warn(error.stack ?? error.message ?? error)
            await ctx.reply(`${PING_EMBI} something went wrong with the morse command -> \`${error.message ?? error}\`\n-# check the full error stack in the console, nerd`)
        }
    }
} satisfies SlashCommand
