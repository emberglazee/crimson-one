import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

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
        const banner = interaction.options.getAttachment('banner', true)
        await interaction.client.user.setBanner(banner.url)
        await interaction.editReply('✅ Banner changed')
    }
} satisfies SlashCommand
