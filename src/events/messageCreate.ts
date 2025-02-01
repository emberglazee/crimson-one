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
                return
            }

            if (message.content.startsWith('!ban ')) {
                const userId = message.content.split(' ')[1]
                await crimsonChat.banUser(userId)
                await message.react('✅')
                return
            }
            if (message.content.startsWith('!unban ')) {
                const userId = message.content.split(' ')[1]
                await crimsonChat.unbanUser(userId)
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

        const attachments = message.attachments.map(att => att.url)

        if (!content.length && message.stickers.first()) content = `<sticker: ${message.stickers.first()!.name}>`
        if (attachments.length) {
            for (const attachment of attachments) {
                content += `<attachment: ${attachment}>\n`
            }
        }
        if (message.embeds.length) {
            const embed = message.embeds[0]
            // Describe the entirety of the embed
            content += `<embed: ${JSON.stringify(embed)}>\n`
        }

        // Start typing indicator loop
        const typingInterval = setInterval(() => {
            message.channel.sendTyping().catch(() => {
                // Ignore errors from sending typing indicator
            });
        }, 8000);

        // Initial typing indicator
        await message.channel.sendTyping();

        try {
            await crimsonChat.sendMessage(content, {
                username: message.author.username,
                displayName: message.member!.displayName,
                serverDisplayName: message.member?.displayName ?? message.author.displayName,
                respondingTo
            }, message)
        } finally {
            // Always clear the interval when done
            clearInterval(typingInterval)
        }
    })
}
