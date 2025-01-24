import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
const logger = new Logger('command.test')

export default {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        logger.info('Command executed')
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        logger.info(`Ephemeral: ${ephemeral}`)
        await interaction.reply({
            content: `Test command executed, ephemeral: ${ephemeral}`,
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
        logger.ok('Command execution over')
    }
} satisfies SlashCommand
