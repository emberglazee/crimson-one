import { SlashCommand } from '../types/types'
import { SlashCommandBuilder, AttachmentBuilder, MessageFlags } from 'discord.js'
import { createCanvas, loadImage } from 'canvas'

export default {
    data: new SlashCommandBuilder()
        .setName('ac7portrait')
        .setDescription('Generate an Ace Combat 7 style portrait with either a custom image or someone\'s avatar')
        .addStringOption(so => so
            .setName('name')
            .setDescription('Name to display on the portrait')
            .setRequired(true)
        ).addAttachmentOption(ao => ao
            .setName('image')
            .setDescription('Custom image to use as the portrait')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('url')
            .setDescription('URL of the image to use as the portrait')
            .setRequired(false)
        ).addUserOption(uo => uo
            .setName('user')
            .setDescription('User to use their avatar as the portrait')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('subtext')
            .setDescription('Smaller text to display below the name')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('filter')
            .setDescription('Apply green tint filter to the image')
            .setRequired(false)
        ).addBooleanOption(so => so
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction, { deferReply, editReply, getUserAvatar }) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        await deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })

        // Get image URL from options
        const attachment = interaction.options.getAttachment('image')
        const urlOption = interaction.options.getString('url')
        const user = interaction.options.getUser('user')
        const name = interaction.options.getString('name', true)
        const subtext = interaction.options.getString('subtext')
        const useFilter = interaction.options.getBoolean('filter') ?? false

        // Validate image source options
        const selectedOptions = [attachment, urlOption, user].filter(Boolean).length
        if (selectedOptions === 0) {
            await editReply('❌ Please provide either an image attachment, URL, or user mention.')
            return
        }
        if (selectedOptions > 1) {
            await editReply('❌ Please provide only one image source (attachment, URL, or user mention).')
            return
        }

        let imageUrl = urlOption
        if (attachment) {
            imageUrl = attachment.url
        } else if (user) {
            imageUrl = getUserAvatar(user, interaction.guild, { size: 256, extension: 'png' })
        }

        if (!imageUrl) {
            await editReply('❌ Invalid image URL provided.')
            return
        }

        try {
            const image = await loadImage(imageUrl)
            const canvas = createCanvas(290, 362)
            const ctx = canvas.getContext('2d')

            // Fill background with semi-transparent dark green
            ctx.fillStyle = '#0e0f1a'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            // Draw the image centered at (20,18) with 250x250 dimensions
            ctx.drawImage(image, 20, 18, 250, 250)

            // Apply green tint if enabled
            if (useFilter) {
                ctx.globalCompositeOperation = 'color-burn'
                ctx.fillStyle = 'rgba(29, 43, 33, 0.3)' // Slight green tint
                ctx.fillRect(20, 18, 250, 250)
                ctx.globalCompositeOperation = 'source-over'
            }

            // Add name text
            ctx.shadowBlur = 2
            ctx.font = '24px Aces07'

            // Draw name shadow
            ctx.shadowColor = '#808080'
            ctx.shadowOffsetX = -4
            ctx.shadowOffsetY = 4
            ctx.fillStyle = '#ffffff'

            // Draw each character with spacing
            let currentX = 20 // Fixed left position
            const chars = name.split('')
            chars.forEach(char => {
                ctx.fillText(char, currentX, 18 + 250 + 32) // Added 16px
                currentX += ctx.measureText(char).width
            })

            // Add subtext if provided
            if (subtext) {
                ctx.font = '12px Aces07'
                ctx.shadowColor = '#222c34'
                ctx.shadowOffsetX = -4
                ctx.shadowOffsetY = 4
                ctx.fillStyle = '#65797c'
                ctx.fillText(subtext, 20, 18 + 250 + 32 + 8 + 10) // Added 16px
            }

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'portrait.png' })
            await editReply({
                files: [attachment]
            })
        } catch {
            await editReply('❌ Failed to generate portrait.')
        }
    }
} satisfies SlashCommand
