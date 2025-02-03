import { Client, Message, TextChannel } from 'discord.js'
import CrimsonChat from '../modules/CrimsonChat'
import { normalizeUrl } from '../modules/CrimsonChat/utils/urlUtils'
import { CRIMSON_CHAT_SYSTEM_PROMPT } from '../util/constants'
import { AdminCommandHandler } from '../modules/CrimsonChat/AdminCommands'

async function getLastMessages(channel: Message['channel'], limit: number = 15) {
    const messages = await channel.messages.fetch({ limit: limit + 1 }) // +1 to include current message
    return Array.from(messages.values())
        .reverse()
        .slice(0, -1) // Remove the current message
        .map(msg => ({
            content: msg.content,
            username: msg.author.username,
            displayName: msg.member?.displayName ?? msg.author.displayName,
            serverDisplayName: msg.member?.displayName ?? msg.author.displayName
        }))
}

export default function onMessageCreate(client: Client) {
    const crimsonChat = CrimsonChat.getInstance()
    crimsonChat.setClient(client)
    const adminCommands = new AdminCommandHandler(crimsonChat, client)

    client.on('messageCreate', async message => {
        if (message.author === client.user) return

        const isMainChannel = message.channel.id === '1335992675459141632'
        const isMentioned = message.mentions.users.has(client.user!.id)

        // Handle messages in main channel
        if (isMainChannel) {
            // Handle admin commands first
            const wasAdminCommand = await adminCommands.handleCommand(message)
            if (wasAdminCommand) return

            // Skip processing if chat is disabled or user is banned
            if (!crimsonChat.isEnabled()) return
            if (crimsonChat.isBanned(message.author.id)) {
                await message.react('❌')
                return
            }

            let { content } = message

            // Get reply context if message is a reply
            const respondingTo = message.reference?.messageId ? {
                targetUsername: (await message.channel.messages.fetch(message.reference.messageId)).author.username,
                targetText: (await message.channel.messages.fetch(message.reference.messageId)).content
            } : undefined

            // Collect all image URLs
            const imageAttachments = new Set<string>()

            // Add attachment images
            message.attachments.forEach(att => {
                if (att.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name)) {
                    imageAttachments.add(normalizeUrl(att.url))
                } else {
                    content += `\n< attachment: ${att.url} >`
                }
            })

            // Add embed images
            message.embeds.forEach(embed => {
                if (embed.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(embed.url)) {
                    imageAttachments.add(normalizeUrl(embed.url))
                }
                if (embed.thumbnail?.url) {
                    imageAttachments.add(normalizeUrl(embed.thumbnail.url))
                }
            })

            // Handle stickers and other embeds
            if (!content.length && message.stickers.first()) {
                content = `< sticker: ${message.stickers.first()!.name} >`
            }
            if (message.embeds.length) {
                content += `\n< embed: ${JSON.stringify(message.embeds[0])} >`
            }

            await crimsonChat.sendMessage(content, {
                username: message.author.username,
                displayName: message.member!.displayName,
                serverDisplayName: message.member?.displayName ?? message.author.displayName,
                respondingTo,
                imageAttachments: Array.from(imageAttachments)
            }, message)
            return
        }

        // Handle mentions outside main channel
        if (isMentioned) {
            let { content } = message

            // Get reply context if message is a reply
            const respondingTo = message.reference?.messageId ? {
                targetUsername: (await message.channel.messages.fetch(message.reference.messageId)).author.username,
                targetText: (await message.channel.messages.fetch(message.reference.messageId)).content
            } : undefined

            const imageAttachments = new Set<string>()
            // Add attachment images
            message.attachments.forEach(att => {
                if (att.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name)) {
                    imageAttachments.add(normalizeUrl(att.url))
                } else {
                    content += `\n< attachment: ${att.url} >`
                }
            })

            // Add embed images
            message.embeds.forEach(embed => {
                if (embed.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(embed.url)) {
                    imageAttachments.add(normalizeUrl(embed.url))
                }
                if (embed.thumbnail?.url) {
                    imageAttachments.add(normalizeUrl(embed.thumbnail.url))
                }
            })

            // Handle stickers and other embeds
            if (!content.length && message.stickers.first()) {
                content = `< sticker: ${message.stickers.first()!.name} >`
            }
            if (message.embeds.length) {
                content += `\n< embed: ${JSON.stringify(message.embeds[0])} >`
            }

            // Get recent message context
            const contextMessages = await getLastMessages(message.channel)

            // Add note about being outside main channel
            const channelName = message.channel.isDMBased() ? 'DM' : `#${(message.channel as TextChannel).name}`
            content = `[Note: This message was sent from ${channelName}]\n${content}`

            await crimsonChat.sendMessage(content, {
                username: message.author.username,
                displayName: message.member!.displayName,
                serverDisplayName: message.member?.displayName ?? message.author.displayName,
                respondingTo,
                imageAttachments: Array.from(imageAttachments),
                contextMessages,
                targetChannel: message.channel as TextChannel
            }, message)
        }
    })
}
