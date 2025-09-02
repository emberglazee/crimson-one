import { SlashCommand } from '../types'
import { SlashCommandBuilder, AttachmentBuilder, MessageFlags } from 'discord.js'
import { Logger, red } from '../modules/Logger'
import { createCanvas, loadImage } from 'canvas'

export default {
    data: new SlashCommandBuilder()
        .setName('ac7portrait')
        .setDescription('Generate an Ace Combat 7 style portrait with either a custom image or someone\'s avatar')
        .addStringOption(option => option
            .setName('name')
            .setDescription('Name to display on the portrait')
            .setRequired(true)
        ).addAttachmentOption(option => option
            .setName('image')
            .setDescription('Custom image to use as the portrait')
            .setRequired(false)
        ).addStringOption(option => option
            .setName('url')
            .setDescription('URL of the image to use as the portrait')
            .setRequired(false)
        ).addUserOption(option => option
            .setName('user')
            .setDescription('User to use their avatar as the portrait')
            .setRequired(false)
        ).addStringOption(option => option
            .setName('subtext')
            .setDescription('Smaller text to display below the name')
            .setRequired(false)
        ).addBooleanOption(option => option
            .setName('filter')
            .setDescription('Apply VHS glitch effect to the image')
            .setRequired(false)
        ).addBooleanOption(option => option
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(ctx) {
        await ctx.deferReply({
            flags: ctx.getBooleanOption('ephemeral', false) ? MessageFlags.Ephemeral : undefined
        })

        const user = await ctx.getUserOption('user')

        const imageAttachment = ctx.getAttachmentOption('image')
        const urlOption = ctx.getStringOption('url')

        const name = ctx.getStringOption('name', true)
        const subtext = ctx.getStringOption('subtext')
        const useFilter = ctx.getBooleanOption('filter', false)

        // Validate image source options
        const selectedOptions = [imageAttachment, urlOption, user].filter(Boolean).length
        if (selectedOptions === 0) {
            await ctx.editReply('❌ Please provide either an image attachment, URL, or user mention.')
            return
        }
        if (selectedOptions > 1) {
            await ctx.editReply('❌ Please provide only one image source (attachment, URL, or user mention).')
            return
        }

        let imageUrl = urlOption
        if (imageAttachment) {
            imageUrl = imageAttachment.url
        } else if (user) {
            imageUrl = ctx.getUserAvatar(user, ctx.guild, { size: 256, extension: 'png' })
        }

        if (!imageUrl) {
            await ctx.editReply('❌ Invalid image URL provided.')
            return
        }

        try {
            const image = await loadImage(imageUrl)
            const canvas = createCanvas(290, 362)
            const cctx = canvas.getContext('2d')

            // Fill background with semi-transparent dark green
            cctx.fillStyle = '#0e0f1a'
            cctx.fillRect(0, 0, canvas.width, canvas.height)

            // Draw the image centered at (20,18) with 250x250 dimensions
            cctx.drawImage(image, 20, 18, 250, 250)

            // Apply VHS glitch effect if enabled
            if (useFilter) {
                // Save the current image data
                const imageData = cctx.getImageData(20, 18, 250, 250)
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
                        const lineData = cctx.getImageData(20, 18 + y, 250, 1)
                        cctx.putImageData(lineData, 20 + shift, 18 + y)
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
                cctx.putImageData(imageData, 20, 18)
            }

            // Add name text
            cctx.shadowBlur = 2
            cctx.font = '24px Aces07'

            // Draw name shadow
            cctx.shadowColor = '#808080'
            cctx.shadowOffsetX = -4
            cctx.shadowOffsetY = 4
            cctx.fillStyle = '#FFFFFF'

            // Draw each character with spacing
            let currentX = 20 // Fixed left position
            const chars = name.split('')
            chars.forEach(char => {
                cctx.fillText(char, currentX, 18 + 250 + 32) // Added 16px
                currentX += cctx.measureText(char).width
            })

            // Add subtext if provided
            if (subtext) {
                cctx.font = '12px Aces07'
                cctx.shadowColor = '#222c34'
                cctx.shadowOffsetX = -4
                cctx.shadowOffsetY = 4
                cctx.fillStyle = '#627f80'
                cctx.fillText(subtext, 20, 18 + 250 + 32 + 8 + 10) // Added 16px
            }

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'portrait.png' })
            await ctx.editReply({
                files: [attachment]
            })
        } catch (error) {
            const logger = new Logger('/ac7portrait')
            logger.error(`Failed to generate portrait: ${red(error instanceof Error ? error.message : String(error))}`)
            await ctx.editReply(`❌ Failed to generate portrait: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }
} satisfies SlashCommand
