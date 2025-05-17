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
            .setDescription('Apply VHS glitch effect to the image')
            .setRequired(false)
        ).addBooleanOption(so => so
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(context) {
        await context.deferReply({
            flags: await context.getBooleanOption('ephemeral', false) ? MessageFlags.Ephemeral : undefined
        })

        // Get image URL from options
        const attachment = await context.getAttachmentOption('image')
        const urlOption = await context.getStringOption('url')
        const user = await context.getUserOption('user')
        const name = await context.getStringOption('name', true)
        const subtext = await context.getStringOption('subtext')
        const useFilter = await context.getBooleanOption('filter', false)

        // Validate image source options
        const selectedOptions = [attachment, urlOption, user].filter(Boolean).length
        if (selectedOptions === 0) {
            await context.editReply('❌ Please provide either an image attachment, URL, or user mention.')
            return
        }
        if (selectedOptions > 1) {
            await context.editReply('❌ Please provide only one image source (attachment, URL, or user mention).')
            return
        }

        let imageUrl = urlOption
        if (attachment) {
            imageUrl = attachment.url
        } else if (user) {
            imageUrl = await context.getUserAvatar(user, context.guild, { size: 256, extension: 'png' })
        }

        if (!imageUrl) {
            await context.editReply('❌ Invalid image URL provided.')
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

            // Apply VHS glitch effect if enabled
            if (useFilter) {
                // Save the current image data
                const imageData = ctx.getImageData(20, 18, 250, 250)
                const data = imageData.data

                // Apply color channel splitting
                for (let i = 0; i < data.length; i += 4) {
                    // Randomly shift red channel
                    if (Math.random() < 0.1) {
                        data[i] = data[i + 4] || data[i]
                    }
                    // Randomly shift blue channel
                    if (Math.random() < 0.1) {
                        data[i + 2] = data[i + 6] || data[i + 2]
                    }
                }

                // Add horizontal line shifts
                for (let y = 0; y < 250; y += 2) {
                    if (Math.random() < 0.1) {
                        const shift = Math.floor(Math.random() * 10) - 5
                        const lineData = ctx.getImageData(20, 18 + y, 250, 1)
                        ctx.putImageData(lineData, 20 + shift, 18 + y)
                    }
                }

                // Add some noise/static
                for (let i = 0; i < data.length; i += 4) {
                    if (Math.random() < 0.05) {
                        const noise = Math.floor(Math.random() * 50) - 25
                        data[i] = Math.max(0, Math.min(255, data[i] + noise))
                        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
                        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
                    }
                }

                // Put the modified image data back
                ctx.putImageData(imageData, 20, 18)
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
                ctx.fillStyle = '#627f80'
                ctx.fillText(subtext, 20, 18 + 250 + 32 + 8 + 10) // Added 16px
            }

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'portrait.png' })
            await context.editReply({
                files: [attachment]
            })
        } catch {
            await context.editReply('❌ Failed to generate portrait.')
        }
    }
} satisfies SlashCommand
