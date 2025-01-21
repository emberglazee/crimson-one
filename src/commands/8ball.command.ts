import { SlashCommand } from '../modules/CommandManager'
import { CommandInteraction, SlashCommandBuilder } from 'discord.js'
import { sleep } from 'bun'

export default {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8ball a question.')
        .addStringOption(so => so
            .setName('question')
            .setDescription('The question you want to ask the magic 8ball.')
            .setRequired(true)
        ),
    async execute(interaction) {
        const question = interaction.options.getString('question', true)
        const responses = [
            // Positive responses
            'As certain as Cascadia\'s victory.',
            'Without a doubt, like a Frost on your six.',
            'The Federation confirms it.',
            'As sure as PW-Mk.1\'s superiority.',
            'Kaiser would approve.',
            'Crimson 1 says yes.',
            'Like a perfect gun run.',
            'Clear skies ahead.',
            // Neutral responses
            'Ask Diplomat later.',
            'Comic needs more time to think.',
            'Prez is unsure.',
            'Radio interference, try again.',
            'Too much G-force, ask again.',
            'Checking with Sicario command...',
            // Negative responses
            'Not even with a railgun.',
            'Negative, RTB immediately.',
            'Mission failed.',
            'About as likely as peace with the Federation.',
            'Even Monarch wouldn\'t try that.',
            'Orange warning lights on that one.'
        ]
        const response = responses[Math.floor(Math.random() * responses.length)]
        await interaction.reply(`🎱 Question: ${question}`)
        await sleep(2000)
        await interaction.editReply(`🎱 Question: ${question}\n\nAnswer: ${response}`)
    }
} satisfies SlashCommand
