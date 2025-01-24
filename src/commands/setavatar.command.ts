import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
const logger = new Logger('command.setavatar')

export default {
    data: new SlashCommandBuilder()
        .setName('setavatar')
        .setDescription('Change bot avatar')
        .addAttachmentOption(ao => ao
            .setName('avatar')
            .setDescription('New avatar')
            .setRequired(true)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        logger.info('Command executed')
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        const user = interaction.user
        if (user.id !== '341123308844220447') {
            await interaction.reply({
                content: '❌ You, solely, are responsible for this',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        await interaction.deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
        const avatar = interaction.options.getAttachment('avatar', true)
        logger.info(`Changing avatar to ${avatar.url}...`)
        await interaction.client.user.setAvatar(avatar.url)
        logger.ok(`Avatar changed`)
        await interaction.editReply('✅ Avatar changed')
        logger.ok('Command execution over')
    }
} satisfies SlashCommand
