import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'

const logger = new Logger('command.preble')
export default {
    data: new SlashCommandBuilder()
        .setName('preble')
        .setDescription('Preble.')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        logger.info('Command executed')
        await interaction.deferReply({
            flags: interaction.options.getBoolean('ephemeral', false) ? MessageFlags.Ephemeral : undefined
        })
        await interaction.editReply({
            files: [{
                attachment: './data/preble.wav',
                name: 'preble.wav'
            }]
        })
    }
} satisfies SlashCommand
