import { SlashCommand } from '../types/types'
import { MessageFlags, SlashCommandBuilder } from 'discord.js'
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
        ).addBooleanOption(so => so
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute({ reply, editReply }, interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        const question = interaction.options.getString('question', true)
        const theme = interaction.options.getString('theme', false)

        // Cascadia/Sicario-themed responses
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

        // Pacific Federation-themed responses
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

        // Generic responses always included
        const genericResponses = [
            'Too much G-force, try again.',
            'Radio interference, try again.',
            'Not even with a railgun.',
            'Negative, RTB immediately.',
            'Not even with a Cordium warhead.'
        ]

        // Determine the final response pool
        let finalResponses
        if (theme === 'cascadia') {
            finalResponses = [...cascadiaResponses, ...genericResponses]
        } else {
            finalResponses = [...federationResponses, ...genericResponses]
        }

        // Pick a random response
        const response = finalResponses[Math.floor(Math.random() * finalResponses.length)]

        const msgPrefix = `💬 ${interaction.user}: *${question}*\n`
        const msgAnswer = `🎱 **8ball says:** ${response}`
        const msgLoading = '🔮 *Shaking the magic 8ball...*'

        await reply({
            content: msgPrefix + msgLoading,
            flags: ephemeral ? MessageFlags.Ephemeral : undefined,
        })
        await sleep(randRange(600, 3000))
        await editReply(msgPrefix + msgAnswer)
    }
} satisfies SlashCommand
