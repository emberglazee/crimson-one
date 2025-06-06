import { EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import type { ImageExtension, ImageSize } from 'discord.js'
import type { SlashCommand } from '../types/types'

const bannerExtensionOptions = [
    { name: 'GIF', value: 'gif' },
    { name: 'WEBP', value: 'webp' },
    { name: 'PNG', value: 'png' },
    { name: 'JPEG', value: 'jpg' }
] as const
const bannerSizes = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096] as const
const bannerSizeOptions = bannerSizes.map(size => ({ name: `${size}px` as const, value: size }))

export default {
    data: new SlashCommandBuilder()
        .setName('banner')
        .setDescription('Show the banner of a user')
        .addUserOption(uo => uo
            .setName('user')
            .setDescription('The user to show the banner of (default: yourself)')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('raw')
            .setDescription('Send as a raw message? (default: false)')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('extension')
            .setDescription('Image format to get the banner in (default: PNG, if banner is animated, pick GIF)')
            .addChoices(...bannerExtensionOptions)
            .setRequired(false)
        ).addNumberOption(no => no
            .setName('size')
            .setDescription('Banner size (default: 1024)')
            .addChoices(...bannerSizeOptions)
            .setRequired(false)
        ),
    async execute(context) {
        const user = await context.getUserOption('user', false, context.author)
        const raw = context.getBooleanOption('raw', false, false)
        const ext = context.getStringOption('extension', false, 'png') as ImageExtension
        const size = context.getIntegerOption('size', false, 1024) as ImageSize

        const fetchedUser = await user.fetch(true)
        const banner = fetchedUser.bannerURL ? fetchedUser.bannerURL({ extension: ext, size: size }) : null
        if (!banner) {
            await context.reply({ content: 'User does not have a banner', ephemeral: true })
            return
        }

        if (raw) {
            await context.reply(banner)
            return
        }

        const embed = new EmbedBuilder()
            .setColor('Random')
            .setDescription(`[Click here to view the banner](${banner})`)
            .setImage(banner)

        await context.reply({ embeds: [embed] })
    }
} satisfies SlashCommand
