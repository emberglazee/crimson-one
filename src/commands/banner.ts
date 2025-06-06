import { EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('banner')
        .setDescription('Show the banner of a user')
        .addUserOption(uo => uo
            .setName('user')
            .setDescription('The user to show the banner of')
            .setRequired(true)
        ),
    async execute(context) {
        const user = await (
            await context.getUserOption('user', true)
        ).fetch(true)

        const banner = user.bannerURL()
        if (!banner) {
            await context.reply({ content: 'User does not have a banner', ephemeral: true })
            return
        }

        const embed = new EmbedBuilder()
            .setColor('Random')
            .setDescription(`[Click here to view the banner](${banner})`)
            .setImage(banner)

        await context.reply({ embeds: [embed] })
    }
} satisfies SlashCommand
