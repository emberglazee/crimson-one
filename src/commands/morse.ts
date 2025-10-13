import { Logger } from '../modules'
const logger = new Logger('/morse')

import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { PING_EMBI } from '../util/constants'
import morse from 'morse'

export default {
    data: new SlashCommandBuilder()
        .setName('morse')
        .setDescription('Decodes or encodes text from or to Morse code')
        .addSubcommand(subcommand => subcommand
            .setName('decode')
            .setDescription('Decodes Morse code into text')
            .addStringOption(option => option
                .setName('code')
                .setDescription('The Morse code to decode')
            )
        ).addSubcommand(subcommand => subcommand
            .setName('encode')
            .setDescription('Encodes text into Morse code')
            .addStringOption(option => option
                .setName('text')
                .setDescription('The text to encode into Morse code')
            )
        ).setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
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
