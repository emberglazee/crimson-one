import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('kill')
        .setDescription('"YES! KILL!" - Steve Harvey'),
    async execute(context) {
        await context.deferReply()
        await context.editReply({
            files: [{
                attachment: './data/KILL.mov',
                name: 'KILL.mov'
            }]
        })
    }
} satisfies SlashCommand
