import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('myresolution')
        .setDescription('Sends the "my resolution - airstrike" meme'),
    async execute(context) {
        const { reply } = context
        await reply({
            files: [{
                attachment: './data/my resolution.mp4',
                name: 'my resolution.mp4'
            }]
        })
    }
} satisfies SlashCommand
