import { Client } from 'discord.js'
import CrimsonChat from '../modules/CrimsonChat'

export default function onMessageCreate(client: Client) {
    const crimsonChat = CrimsonChat.getInstance()
    crimsonChat.setClient(client)

    client.on('messageCreate', async message => {
        if (message.channel.id !== '1333319963737325570') return
        if (message.author === client.user) return

        // Handle admin commands for specific user
        if (message.author.id === '341123308844220447') {
            if (message.content === '!reset') {
                await crimsonChat.clearHistory()
                await message.react('✅')
                return
            }
            if (message.content === '!toggle') {
                crimsonChat.setEnabled(!crimsonChat.isEnabled())
                await message.react(crimsonChat.isEnabled() ? '✅' : '🔴')
                await crimsonChat.sendMessage('Chat is now ' + (crimsonChat.isEnabled() ? 'enabled' : 'disabled') + ', you will' + (crimsonChat.isEnabled() ? ' ' : ' not') + ' be able to see and reply to users messages now.', {
                    username: 'System',
                    displayName: 'System',
                    serverDisplayName: 'System'
                })
                return
            }

            if (message.content.startsWith('!ban ')) {
                const userId = message.content.split(' ')[1]
                await crimsonChat.banUser(userId)
                await message.react('✅')
                const user = await client.users.fetch(userId)
                await crimsonChat.sendMessage(`User ${user.username} has been banned, you are now not able to see their messages.`, {
                    username: 'System',
                    displayName: 'System',
                    serverDisplayName: 'System'
                })
                return
            }
            if (message.content.startsWith('!unban ')) {
                const userId = message.content.split(' ')[1]
                await crimsonChat.unbanUser(userId)
                await message.react('✅')
                const user = await client.users.fetch(userId)
                await crimsonChat.sendMessage(`User ${user.username} has been unbanned, you are now able to see their messages.`, {
                    username: 'System',
                    displayName: 'System',
                    serverDisplayName: 'System'
                })
                return
            }
            if (message.content === '!forcebreak') {
                crimsonChat.setForceNextBreakdown(true)
                await message.react('✅')
                return
            }
        }

        // Skip processing if chat is disabled or user is banned
        if (!crimsonChat.isEnabled()) return
        if (crimsonChat.isBanned(message.author.id)) {
            await message.react('❌')
            return
        }

        let { content } = message
        const respondingTo = message.reference?.messageId ? {
            targetUsername: (await message.channel.messages.fetch(message.reference.messageId)).author.username,
            targetText: (await message.channel.messages.fetch(message.reference.messageId)).content
        } : undefined

        // Separate image attachments from other attachments
        const imageAttachments: Set<string> = new Set()
        const otherAttachments: string[] = []

        message.attachments.forEach(att => {
            // Check for image MIME types and common image extensions
            const isImage = att.contentType?.startsWith('image/') || 
                /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name)

            if (isImage) {
                imageAttachments.add(att.url)
            } else {
                otherAttachments.push(att.url)
            }
        })

        // Add image URLs from embeds
        message.embeds.forEach(embed => {
            if (embed.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(embed.url)) {
                imageAttachments.add(embed.url)
            }
            if (embed.thumbnail?.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(embed.thumbnail.url)) {
                imageAttachments.add(embed.thumbnail.url)
            }
        })

        if (!content.length && message.stickers.first()) content = `< sticker: ${message.stickers.first()!.name} >`
        if (otherAttachments.length) {
            for (const attachment of otherAttachments) {
                content += `\n< attachment: ${attachment} >`
            }
        }
        if (message.embeds.length) {
            const embed = message.embeds[0]
            content += `\n< embed: ${JSON.stringify(embed)} >`
        }

        // Start typing indicator loop
        const typingInterval = setInterval(() => {
            message.channel.sendTyping().catch(() => {
                // Ignore errors from sending typing indicator
            })
        }, 8000)

        // Initial typing indicator
        await message.channel.sendTyping()

        try {
            await crimsonChat.sendMessage(content, {
                username: message.author.username,
                displayName: message.member!.displayName,
                serverDisplayName: message.member?.displayName ?? message.author.displayName,
                respondingTo,
                imageAttachments: Array.from(imageAttachments) // Pass image attachments separately
            }, message)
        } finally {
            // Always clear the interval when done
            clearInterval(typingInterval)
        }
    })
}
