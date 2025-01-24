import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'

const logger = new Logger('command.myresolution')
export default {
    data: new SlashCommandBuilder()
        .setName('myresolution')
        .setDescription('Sends the "my resolution - airstrike" meme')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        logger.info('Command executed')
        await interaction.deferReply({
            flags: interaction.options.getBoolean('ephemeral', false) ? MessageFlags.Ephemeral : undefined
        })
        await interaction.editReply({
            files: [{
                attachment: './data/my resolution.mp4',
                name: 'my resolution.mp4'
            }]
        })
    }
} satisfies SlashCommand
