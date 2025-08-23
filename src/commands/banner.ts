import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js'
import type { ImageExtension, ImageSize } from 'discord.js'
import type { SlashCommand } from '../types'

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
        .addUserOption(option => option
            .setName('user')
            .setDescription('The user to show the banner of (default: yourself)')
            .setRequired(false)
        ).addBooleanOption(option => option
            .setName('raw')
            .setDescription('Send as a raw message? (default: false)')
            .setRequired(false)
        ).addStringOption(option => option
            .setName('extension')
            .setDescription('Image format to get the banner in (default: PNG, if banner is animated, pick GIF)')
            .addChoices(...bannerExtensionOptions)
            .setRequired(false)
        ).addNumberOption(option => option
            .setName('size')
            .setDescription('Banner size (default: 1024)')
            .addChoices(...bannerSizeOptions)
            .setRequired(false)
        ),
    async execute(ctx) {
        const user = await ctx.getUserOption('user', false, ctx.author)
        const raw = ctx.getBooleanOption('raw', false, false)
        const ext = ctx.getStringOption('extension', false, 'png') as ImageExtension
        const size = ctx.getIntegerOption('size', false, 1024) as ImageSize

        const fetchedUser = await user.fetch(true)
        const banner = fetchedUser.bannerURL ? fetchedUser.bannerURL({ extension: ext, size: size }) : null
        if (!banner) {
            await ctx.reply({ content: 'User does not have a banner', flags: MessageFlags.Ephemeral })
            return
        }

        if (raw) {
            await ctx.reply(banner)
            return
        }

        const embed = new EmbedBuilder()
            .setColor('Random')
            .setDescription(`[Click here to view the banner](${banner})`)
            .setImage(banner)

        await ctx.reply({ embeds: [embed] })
    }
} satisfies SlashCommand
