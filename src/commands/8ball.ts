import { SlashCommand } from '../types/types'
import { SlashCommandBuilder } from 'discord.js'
import { sleep } from 'bun'
import { randRange } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8ball a question.')
        .addStringOption(so => so
            .setName('question')
            .setDescription('The question you want to ask the magic 8ball.')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('theme')
            .setDescription('Choose the theme of the answer.')
            .addChoices(
                { name: 'Cascadia/Sicario', value: 'cascadia' },
                { name: 'Pacific Federation', value: 'federation' },
                { name: 'Random', value: 'random' }
            )
        ),
    async execute(context) {
        const question = await context.getStringOption('question', true)
        const theme = await context.getStringOption('theme', false)

        const cascadiaResponses = [
            'As certain as Cascadia\'s victory.',
            'Kaiser would approve.',
            'Without a doubt, like Monarch on your six.',
            'Like a perfect gun run.',
            'Comic says yes!',
            'Clear skies ahead.',
            'Prez says no.',
            'Even Diplomat wouldn\'t risk it.',
            'Too much Cordium in the air, ask again later.',
            'Galaxy gives the green light.',
            'Negative Hitman 1, you just shot down a civilian airliner.',
            'Cascadian command is busy right now, try again.'
        ]

        const federationResponses = [
            'As certain as the Federation\'s supremacy.',
            'The Federation confirms it.',
            'As certain as the Federation\'s victory.',
            'Crimson 1 says yes.',
            'The Federation sees no error.',
            'Negative Driver, RTB.',
            'Orange lights across the board, try later.',
            'The winds of the Federation don\'t favor it.',
            'Predictable.',
            'Crystal Kingdom denies the request.',
            'Crystal Kingdom is busy right now, try again.',
            'Even Bookie wouldn\'t take that bet.'
        ]

        const genericResponses = [
            'Too much G-force, try again.',
            'Radio interference, try again.',
            'Not even with a railgun.',
            'Negative, RTB immediately.',
            'Not even with a Cordium warhead.'
        ]

        let finalResponses
        if (theme === 'cascadia') {
            finalResponses = [...cascadiaResponses, ...genericResponses]
        } else {
            finalResponses = [...federationResponses, ...genericResponses]
        }

        const response = finalResponses[Math.floor(Math.random() * finalResponses.length)]

        const msgPrefix = `💬 ${context.user}: *${question}*\n`
        const msgAnswer = `🎱 **8ball says:** ${response}`
        const msgLoading = '🔮 *Shaking the magic 8ball...*'

        await context.reply(msgPrefix + msgLoading)
        await sleep(randRange(600, 3000))
        await context.editReply(msgPrefix + msgAnswer)
    }
} satisfies SlashCommand
