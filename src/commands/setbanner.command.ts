import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

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
    async execute(interaction, { reply, deferReply, editReply, client, myId }) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        const user = interaction.user
        if (user.id !== myId) {
            await reply({
                content: '❌ You, solely, are responsible for this.',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }
        await deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
        const banner = interaction.options.getAttachment('banner', true)
        await client.user.setBanner(banner.url)
        await editReply('✅ Banner changed')
    }
} satisfies SlashCommand
