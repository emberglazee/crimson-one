import { EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import type { ImageExtension, ImageSize } from 'discord.js'

import { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s profile picture')
        .addUserOption(uo => uo
            .setName('user')
            .setDescription('User to show their avatar of (default: yourself)')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('raw')
            .setDescription('Send as a raw message? (default: false)')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('extension')
            .setDescription('Image format to get the avatar in (default: PNG)')
            .setChoices(
                { name: 'GIF', value: 'gif' },
                { name: 'WEBP', value: 'webp' },
                { name: 'PNG', value: 'png' },
                { name: 'JPEG', value: 'jpg' }
            ).setRequired(false)
        ).addNumberOption(no => no
            .setName('size')
            .setDescription('Avatar size (default: 1024)')
            .setChoices(
                { name: '16', value: 16 },
                { name: '32', value: 32 },
                { name: '64', value: 64 },
                { name: '128', value: 128 },
                { name: '256', value: 256 },
                { name: '512', value: 512 },
                { name: '1024', value: 1024 },
                { name: '2048', value: 2048 },
                { name: '4096', value: 4096 }
            ).setRequired(false)
        ),
    async execute(interaction) {
        const user = interaction.options.getUser('user', false) ?? interaction.user
        const raw = interaction.options.getBoolean('raw', false) ?? false
        const ext = interaction.options.getString('extension', false) as ImageExtension ?? 'png'
        const size = interaction.options.getNumber('size', false) as ImageSize ?? 1024
        const avatarUrl = user.displayAvatarURL({ size: size, extension: ext })

        if (raw) {
            await interaction.reply(avatarUrl)
            return
        }
        const embed = new EmbedBuilder()
            .setTitle(`Avatar of ${user.username}`)
            .setImage(avatarUrl)
            .setColor('#F96302')
        await interaction.reply({ embeds: [embed] })
    }
} satisfies SlashCommand
