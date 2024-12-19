import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
const logger = new Logger('command.setbanner')

export default {
    data: new SlashCommandBuilder()
        .setName('setbanner')
        .setDescription('Set bot banner')
        .addAttachmentOption(ao => ao
            .setName('banner')
            .setDescription('New banner')
            .setRequired(true)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        logger.info('Command executed')
        await interaction.deferReply({
            ephemeral: interaction.options.getBoolean('ephemeral', false) ?? undefined
        })
        const banner = interaction.options.getAttachment('banner', true)
        logger.info(`Changing banner to ${banner.url}...`)
        await interaction.client.user.setBanner(banner.url)
        logger.ok(`Banner changed`)
        await interaction.editReply('✅ Banner changed')
        logger.ok('Command execution over')
    }
} satisfies SlashCommand
