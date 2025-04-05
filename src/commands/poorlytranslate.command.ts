import { SlashCommand } from '../modules/CommandManager'
import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags
} from 'discord.js'
import { translate } from 'google-translate-api-x'

const languages = [
    'la', 'ja', 'lo', 'ko',
    'ru', 'zh-CN', 'ar', 'hi',
    'th', 'tr', 'vi', 'bg',
    'uk', 'sw', 'no', 'fi',
    'hu', 'my', 'so', 'km',
    'ceb', 'haw', 'gl', 'fy',
    'mr', 'eu', 'en'
]

export default {
    data: new SlashCommandBuilder()
    .setName('poortranslate')
    .setDescription('Translates your text through multiple languages for a goofy, poor translation effect.')
    .addStringOption(option => option
        .setName('text')
        .setDescription('The text to translate.')
        .setRequired(true)
    )
    .addBooleanOption(option => option
        .setName('ephemeral')
        .setDescription('Should the response only be visible to you?')
        .setRequired(false)
    ),

    async execute(interaction: ChatInputCommandInteraction) {
        const ephemeral = interaction.options.getBoolean('ephemeral') ?? false
        const inputText = interaction.options.getString('text', true)

        await interaction.deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })

        let translatedText = inputText

        try {
            for (const lang of languages) {
                const result = await translate(translatedText, { to: lang })
                translatedText = result.text
                console.log(`Translated to ${lang}: ${translatedText}`)
            }
        } catch (error) {
            console.error('Translation error:', error)
            await interaction.editReply({ content: `Uh oh! An error occurred during translation: ${error}` })
            return
        }

        await interaction.editReply(translatedText)
    }
} satisfies SlashCommand
