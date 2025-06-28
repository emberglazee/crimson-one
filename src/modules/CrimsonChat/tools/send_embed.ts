import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | send_embed()')

import { z } from 'zod'
import { tool } from 'ai'
import { bot as client } from '../../..'
import { ChannelType, EmbedBuilder, type TextChannel } from 'discord.js'
import type { HexColor } from '../../../types'

// Hex color regex
const hexColorRegex = /^#(?:[0-9a-fA-F]{3}){1,2}$/

const embedFieldSchema = z.object({
    name: z.string().min(1, 'Field name cannot be empty.').max(256, 'Field name cannot exceed 256 characters.'),
    value: z.string().min(1, 'Field value cannot be empty.').max(1024, 'Field value cannot exceed 1024 characters.'),
    inline: z.boolean().optional()
})

const schema = z.object({
    channelId: z.string().describe("The ID of the channel where the embed should be sent. This is required."),
    replyToMessageId: z.string().optional().describe("The ID of the message to reply to. If omitted, the embed will be sent as a new message in the channel."),
    title: z.string().max(256, 'Title cannot exceed 256 characters.').optional().describe("The title of the embed."),
    description: z.string().max(4096, 'Description cannot exceed 4096 characters.').optional().describe("The main content of the embed."),
    color: z.string().regex(hexColorRegex, "Invalid hex color format.").optional().describe("The hex color code for the embed's side border (e.g., '#FF5733')."),
    author_name: z.string().max(256, 'Author name cannot exceed 256 characters.').optional().describe("The name for the embed's author section."),
    author_url: z.string().url('Author URL must be a valid URL.').optional().describe("A URL to link in the author's name."),
    author_icon_url: z.string().url('Author icon URL must be a valid URL.').optional().describe("A URL for the author's icon."),
    footer_text: z.string().max(2048, 'Footer text cannot exceed 2048 characters.').optional().describe("The text for the embed's footer."),
    footer_icon_url: z.string().url('Footer icon URL must be a valid URL.').optional().describe("A URL for the footer's icon."),
    image_url: z.string().url('Image URL must be a valid URL.').optional().describe("The URL for the main image of the embed."),
    thumbnail_url: z.string().url('Thumbnail URL must be a valid URL.').optional().describe("The URL for the thumbnail image of the embed."),
    fields: z.array(embedFieldSchema).max(25, 'An embed cannot have more than 25 fields.').optional().describe("An array of fields to add to the embed. Max 25 fields."),
    timestamp: z.boolean().optional().describe("Whether to add the current timestamp to the embed footer.")
})

async function invoke(input: z.infer<typeof schema>): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify(input))}`)

    const {
        channelId,
        replyToMessageId,
        title,
        description,
        color,
        author_name,
        author_icon_url,
        author_url,
        footer_text,
        footer_icon_url,
        image_url,
        thumbnail_url,
        fields,
        timestamp
    } = input

    try {
        const channel = await client.channels.fetch(channelId)
        if (!channel || channel.type !== ChannelType.GuildText) {
            return `Error: Channel with ID "${channelId}" not found or is not a text channel.`
        }

        const embed = new EmbedBuilder()

        if (title) embed.setTitle(title)
        if (description) embed.setDescription(description)
        if (color) embed.setColor(color as HexColor)

        if (author_name) {
            embed.setAuthor({
                name: author_name,
                url: author_url,
                iconURL: author_icon_url
            })
        }

        if (footer_text) {
            embed.setFooter({
                text: footer_text,
                iconURL: footer_icon_url
            })
        }

        if (image_url) embed.setImage(image_url)
        if (thumbnail_url) embed.setThumbnail(thumbnail_url)
        if (fields) embed.addFields(fields)
        if (timestamp) embed.setTimestamp()

        if (embed.data.fields?.length === 0 && !embed.data.image && !embed.data.thumbnail) {
            return 'Error: Embed is empty. You must provide at least one property like a title, description, or image.'
        }

        if (replyToMessageId) {
            try {
                const messageToReply = await (channel as TextChannel).messages.fetch(replyToMessageId)
                await messageToReply.reply({ embeds: [embed] })
            } catch (e) {
                logger.warn(`Could not find message to reply to (${replyToMessageId}), sending to channel instead. Error: ${red((e as Error).message)}`)
                await (channel as TextChannel).send({ embeds: [embed] })
            }
        } else {
            await (channel as TextChannel).send({ embeds: [embed] })
        }

        return `Success: Embed sent to channel #${(channel as TextChannel).name}.`

    } catch (e) {
        const error = e as Error
        logger.error(`Failed to send embed: ${red(error.stack ?? error.message)}`)
        return `Error: An internal error occurred while trying to send the embed: ${error.message}`
    }
}

export default tool({
    description: "Sends a customizable rich embed message to a specific Discord channel. Can be used to present information in a structured and visually appealing way.",
    parameters: schema,
    execute: invoke
})
