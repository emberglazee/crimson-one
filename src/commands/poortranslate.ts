import { SlashCommand } from '../types'
import { SlashCommandBuilder } from 'discord.js'
import { translate } from 'google-translate-api-x'
import { shuffleArray } from '../util/functions'
import { ProgressTracker } from '../modules'

export default {
    data: new SlashCommandBuilder()
        .setName('poortranslate')
        .setDescription('Translates your text through multiple languages for a goofy, poor translation effect.')
        .addStringOption(option => option
            .setName('text')
            .setDescription('The text to translate.')
            .setRequired(true)
        ).addBooleanOption(option => option
            .setName('randomize_chain')
            .setDescription('Randomize the language translation chain')
            .setRequired(false)
        ).addStringOption(option => option
            .setName('exit_lang')
            .setDescription('The language to end the translation chain with (default: en)')
            .setRequired(false)
        ),

    async execute(ctx) {
        const time1 = process.hrtime()
        const inputText = ctx.getStringOption('text', true)
        const randomizeChain = ctx.getBooleanOption('randomize_chain', false)
        const exitLang = ctx.getStringOption('exit_lang', false, 'en')

        let languages = [
            'la', 'ja', 'lo', 'ko',
            'ru', 'zh-CN', 'ar', 'hi',
            'th', 'tr', 'vi', 'bg',
            'uk', 'sw', 'no', 'fi',
            'hu', 'my', 'so', 'km',
            'ceb', 'haw', 'gl', 'fy',
            'mr', 'eu',
            exitLang
        ]
        if (randomizeChain) {
            languages = shuffleArray(languages)
            if (languages[languages.length - 1] !== exitLang) languages.push(exitLang)
        }

        await ctx.deferReply()

        const totalSteps = languages.length
        const progressTracker = new ProgressTracker(ctx, 'Poorly Translating...')

        let translatedText = inputText
        try {
            let currentStep = 0
            for (const lang of languages) {
                translatedText = (await translate(translatedText, { to: lang })).text
                currentStep++
                progressTracker.recordStep()
                await progressTracker.update({ current: currentStep, total: totalSteps, statusText: `Translating to ${lang}...` })
            }

        } catch (error) {
            console.error('Translation error:', error)
            await progressTracker.finish(`An error occurred during translation: ${error}`)
            return
        }

        const time2 = process.hrtime(time1)
        const elapsedSeconds = (time2[0] + time2[1] / 1e9).toFixed(3)
        await progressTracker.finish(`**Poorly translated:**\n${inputText}\n**into:**\n${translatedText}\n-# Time: ${elapsedSeconds}s`)
    }
} satisfies SlashCommand
