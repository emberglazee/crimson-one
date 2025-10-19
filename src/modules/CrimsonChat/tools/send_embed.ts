import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | send_embed()')

import { type Client, ChannelType, EmbedBuilder, type HexColorString, type TextChannel } from 'discord.js'
import type { CrimsonTool } from '../types'

interface EmbedField {
    name: string
    value: string
    inline?: boolean
}

async function invoke(
    args: {
        channelId: string
        replyToMessageId?: string
        title?: string
        description?: string
        color?: string
        author_name?: string
        author_url?: string
        author_icon_url?: string
        footer_text?: string
        footer_icon_url?: string
        image_url?: string
        thumbnail_url?: string
        fields?: string // JSON string for fields
        timestamp?: boolean
    },
    { client }: { client: Client }
): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify(args))}`)

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
    } = args

    try {
        const channel = await client.channels.fetch(channelId)
        if (!channel || channel.type !== ChannelType.GuildText) {
            return JSON.stringify({ status: 'error', message: `Channel with ID "${channelId}" not found or is not a text channel.` })
        }

        const embed = new EmbedBuilder()

        if (title) embed.setTitle(title)
        if (description) embed.setDescription(description)
        if (color) embed.setColor(color as HexColorString)

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

        if (fields) {
            try {
                const parsedFields = JSON.parse(fields) as EmbedField[]
                if (Array.isArray(parsedFields)) {
                    embed.addFields(parsedFields)
                } else {
                    throw new Error('Fields parameter must be a JSON array.')
                }
            } catch (e) {
                return JSON.stringify({ status: 'error', message: `Invalid JSON for fields parameter: ${(e as Error).message}` })
            }
        }

        if (timestamp) embed.setTimestamp()

        if (embed.data.fields?.length === 0 && !embed.data.image && !embed.data.thumbnail && !embed.data.description && !embed.data.title) {
            return JSON.stringify({ status: 'error', message: 'The embed is empty. You must provide at least one property, such as a title, description, or image.' })
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

        return JSON.stringify({ status: 'success', message: `Embed sent to channel #${(channel as TextChannel).name}.` })

    } catch (e) {
        const error = e as Error
        logger.error(`Failed to send embed: ${red(error.stack ?? error.message)}`)
        return JSON.stringify({ status: 'error', message: `An internal error occurred while trying to send the embed: ${error.message}` })
    }
}

export default {
    name: 'send_embed',
    description: 'Sends a customizable rich embed message to a specific Discord channel. Can be used to present information in a structured and visually appealing way.',
    parameters: [
        { name: 'channelId', type: 'string', description: 'The ID of the channel where the embed should be sent.', required: true },
        { name: 'replyToMessageId', type: 'string', description: 'The ID of the message to reply to.', required: false },
        { name: 'title', type: 'string', description: 'The title of the embed.', required: false },
        { name: 'description', type: 'string', description: 'The main content of the embed.', required: false },
        { name: 'color', type: 'string', description: "The hex color code for the embed's side border (e.g., '#FF5733').", required: false },
        { name: 'author_name', type: 'string', description: "The name for the embed's author section.", required: false },
        { name: 'author_url', type: 'string', description: "A URL to link in the author's name.", required: false },
        { name: 'author_icon_url', type: 'string', description: "A URL for the author's icon.", required: false },
        { name: 'footer_text', type: 'string', description: "The text for the embed's footer.", required: false },
        { name: 'footer_icon_url', type: 'string', description: "A URL for the footer's icon.", required: false },
        { name: 'image_url', type: 'string', description: 'The URL for the main image of the embed.', required: false },
        { name: 'thumbnail_url', type: 'string', description: 'The URL for the thumbnail image of the embed.', required: false },
        { name: 'fields', type: 'string', description: 'A JSON string representing an array of embed fields. e.g., \'[{"name":"Field 1","value":"Value 1","inline":true}]\'', required: false },
        { name: 'timestamp', type: 'boolean', description: 'Whether to add the current timestamp to the embed footer.', required: false }
    ],
    execute: invoke
} as CrimsonTool
