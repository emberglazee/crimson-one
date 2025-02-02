import { Client } from 'discord.js'
import CrimsonChat from '../modules/CrimsonChat'
import { normalizeUrl } from '../modules/CrimsonChat/utils/urlUtils'

export default function onMessageCreate(client: Client) {
    const crimsonChat = CrimsonChat.getInstance()
    crimsonChat.setClient(client)

    client.on('messageCreate', async message => {
        if (message.channel.id !== '1333319963737325570') return
        if (message.author === client.user) return

        // Handle admin commands for specific user
        if (message.author.id === '341123308844220447') {
            switch (message.content) {
                case '!reset':
                    await crimsonChat.clearHistory()
                    await message.react('✅')
                    return
                case '!updateprompt':
                    await crimsonChat.updateSystemPrompt()
                    await message.react('✅')
                    await crimsonChat.sendMessage(
                        'System prompt has been updated to latest version.',
                        { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                    )
                    return
                case '!toggle':
                    crimsonChat.setEnabled(!crimsonChat.isEnabled())
                    await message.react(crimsonChat.isEnabled() ? '✅' : '🔴')
                    await crimsonChat.sendMessage(
                        `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}`,
                        { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                    )
                    return
                case '!forcebreak':
                    crimsonChat.setForceNextBreakdown(true)
                    await message.react('✅')
                    return
            }

            if (message.content.startsWith('!ban ')) {
                const userId = message.content.split(' ')[1]
                await crimsonChat.banUser(userId)
                await message.react('✅')
                const user = await client.users.fetch(userId)
                await crimsonChat.sendMessage(
                    `User ${user.username} has been banned, you are now not able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                return
            }

            if (message.content.startsWith('!unban ')) {
                const userId = message.content.split(' ')[1]
                await crimsonChat.unbanUser(userId)
                await message.react('✅')
                const user = await client.users.fetch(userId)
                await crimsonChat.sendMessage(
                    `User ${user.username} has been unbanned, you are now able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
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
    })
}
