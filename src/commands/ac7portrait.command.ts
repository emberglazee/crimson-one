import { SlashCommand } from '../modules/CommandManager'
import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js'
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
        ),
    /**
     * Creates an AC7-style portrait frame with the following specifications:
     * - Canvas dimensions: 289x362 pixels
     * - Border: 1px bright green (#00FF00) with 5px inner glow effect
     * - Background: Semi-transparent dark green (#1d2b21ee)
     * 
     * Note: The image/avatar content should be placed starting at coordinates (20,18) 
     * with dimensions of 250x250 pixels
     * 
     * @param interaction The interaction object containing command details
     * @returns Promise<void>
     */
    async execute(interaction) {
        await interaction.deferReply()

        // Get image URL from options
        const attachment = interaction.options.getAttachment('image')
        const urlOption = interaction.options.getString('url')
        const user = interaction.options.getUser('user')
        const name = interaction.options.getString('name', true)
        const subtext = interaction.options.getString('subtext')

        let imageUrl = urlOption
        if (attachment) {
            imageUrl = attachment.url
        } else if (user) {
            imageUrl = user.displayAvatarURL({ size: 256, extension: 'png' })
        } else if (!imageUrl) {
            imageUrl = interaction.user.displayAvatarURL({ size: 256, extension: 'png' })
        }

        try {
            const image = await loadImage(imageUrl)
            const canvas = createCanvas(290, 362) // Adjusted width for perfect centering
            const ctx = canvas.getContext('2d')

            // Fill background with semi-transparent dark green
            ctx.fillStyle = '#1d2b21ee'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            // Draw the image centered at (20,18) with 250x250 dimensions
            ctx.drawImage(image, 20, 18, 250, 250)

            // Add name text
            ctx.shadowBlur = 0
            ctx.font = '20px Aces07'
            ctx.fillStyle = '#536256'
            
            // Calculate total width including gaps
            const letterSpacing = 6
            const chars = name.split('')
            const totalWidth = chars.reduce((width, char) => 
                width + ctx.measureText(char).width + letterSpacing, 0) - letterSpacing

            // Start position for centered text
            let currentX = 20 + (250 - totalWidth) / 2
            
            // Draw each character with spacing
            chars.forEach(char => {
                ctx.fillText(char, currentX, 18 + 250 + 16)
                currentX += ctx.measureText(char).width + letterSpacing
            })

            // Add subtext if provided
            if (subtext) {
                ctx.font = '10px Aces07'
                const subtextMetrics = ctx.measureText(subtext)
                const subtextX = 20 + (250 - subtextMetrics.width) / 2
                ctx.fillText(subtext, subtextX, 18 + 250 + 16 + 8 + 10)
            }

            // Add green border with inner glow
            ctx.shadowColor = '#00ff00'
            ctx.shadowBlur = 5
            ctx.shadowOffsetX = 0
            ctx.shadowOffsetY = 0
            ctx.strokeStyle = '#00ff00'
            ctx.lineWidth = 1
            ctx.strokeRect(0, 0, canvas.width, canvas.height)

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'portrait.png' })
            await interaction.editReply({ files: [attachment] })
        } catch (error) {
            await interaction.editReply('❌ Failed to generate portrait.')
        }
    }
} satisfies SlashCommand
