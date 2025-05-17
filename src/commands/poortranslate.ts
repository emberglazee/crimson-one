import { SlashCommand } from '../types/types'
import { SlashCommandBuilder } from 'discord.js'
import { translate } from 'google-translate-api-x'
import { shuffleArray } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('poortranslate')
        .setDescription('Translates your text through multiple languages for a goofy, poor translation effect.')
        .addStringOption(so => so
            .setName('text')
            .setDescription('The text to translate.')
            .setRequired(true)
        ).addBooleanOption(bo => bo
            .setName('randomize_chain')
            .setDescription('Randomize the language translation chain')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('exit_lang')
            .setDescription('The language to end the translation chain with (default: en)')
            .setRequired(false)
        ),

    async execute(context) {
        const { deferReply, editReply } = context
        const time1 = process.hrtime()
        const inputText = await context.getStringOption('text', true)
        const randomizeChain = await context.getBooleanOption('randomize_chain', false)
        const exitLang = await context.getStringOption('exit_lang', false) ?? 'en'

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

        await deferReply()

        let translatedText = inputText
        const totalSteps = languages.length
        let currentStep = 0
        let lastReportedStep = 0

        // Helper function to create a progress bar string.
        function createProgressBar(completed: number, total: number, barLength: number = 20): string {
            const progress = completed / total
            const filledLength = Math.round(barLength * progress)
            const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
            return bar
        }

        // Set an interval to update progress every 5 seconds if there's new progress.
        const progressInterval = setInterval(() => {
            if (currentStep > lastReportedStep) {
                lastReportedStep = currentStep
                const progressBar = createProgressBar(currentStep, totalSteps)
                editReply(`Translating... ${progressBar} (${currentStep}/${totalSteps})`)
                    .catch(console.error)
            }
        }, 5000)

        try {
            // Process each translation step sequentially.
            for (let i = 0; i < totalSteps; i++) {
                const lang = languages[i]
                const result = await translate(translatedText, { to: lang })
                translatedText = result.text
                currentStep = i + 1
            }
        } catch (error) {
            console.error('Translation error:', error)
            clearInterval(progressInterval)
            await editReply(`An error occurred during translation: ${error}`)
            return
        }

        // Clear the interval and update with the final translation.
        clearInterval(progressInterval)
        const time2 = process.hrtime(time1)
        const elapsedSeconds = (time2[0] + time2[1] / 1e9).toFixed(3)
        await editReply(`**Poorly translated:**\n${inputText}\n**into:**\n${translatedText}\n-# Time: ${elapsedSeconds}s`)
    }
} satisfies SlashCommand
