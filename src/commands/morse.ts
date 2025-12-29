import { Logger } from '../modules'
const logger = new Logger('/morse')

import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { PING_EMBI } from '../util/constants'
import { encode, decode, languages, type LanguageType } from '../util/morse'

const supportedLanguages = languages.map(lang => ({ name: lang.charAt(0).toUpperCase() + lang.slice(1), value: lang }))

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
                .setRequired(true)
            ).addStringOption(option => option
                .setName('language')
                .setDescription('The alphabet to use for decoding (defaults to Latin).')
                .setRequired(false)
                .addChoices(supportedLanguages)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('encode')
            .setDescription('Encodes text into Morse code')
            .addStringOption(option => option
                .setName('text')
                .setDescription('The text to encode into Morse code')
                .setRequired(true)
            ).addStringOption(option => option
                .setName('language')
                .setDescription('The alphabet to use for encoding (defaults to Latin).')
                .setRequired(false)
                .addChoices(supportedLanguages)
            )
        ).setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        try {
            const subcommand = ctx.getSubcommand(true)
            const language = ctx.getStringOption('language') as LanguageType | null ?? 'latin'

            switch (subcommand) {
                case 'decode': {
                    const code = ctx.getStringOption('code', true)
                    const text = decode(code, language)
                    await ctx.reply(text)
                    return
                }
                case 'encode': {
                    const text = ctx.getStringOption('text', true)
                    const code = encode(text, language)
                    await ctx.reply(code)
                    return
                }
            }
        } catch (e) {
            const error = e as Error
            logger.warn(error.stack ?? error.message ?? error)
            await ctx.reply(`${PING_EMBI} something went wrong with the morse command -> \`${error.message ?? error}\`\n-# check the full error stack in the console, nerd`)
        }
    }
} satisfies SlashCommand
