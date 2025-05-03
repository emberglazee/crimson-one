import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import { SlashCommand } from '../types/types'

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
        const avatar = interaction.options.getAttachment('avatar', true)
        await client.user.setAvatar(avatar.url)
        await editReply('✅ Avatar changed')
    }
} satisfies SlashCommand
