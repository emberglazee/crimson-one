import { Client } from 'discord.js'
import CrimsonChat from '../modules/CrimsonChat'

export default function onMessageCreate(client: Client) {
    const crimsonChat = CrimsonChat.getInstance()
    crimsonChat.setClient(client)

    client.on('messageCreate', async message => {
        if (message.channel.id !== '1333319963737325570') return
        if (message.author.bot) return

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
        }

        // Skip processing if chat is disabled
        if (!crimsonChat.isEnabled()) return

        let { content } = message
        const respondingTo = message.reference?.messageId ? {
            targetUsername: (await message.channel.messages.fetch(message.reference.messageId)).author.username,
            targetText: (await message.channel.messages.fetch(message.reference.messageId)).content
        } : undefined

        if (!content.length && message.stickers.first()) content = `<sticker:${message.stickers.first()!.name}>`
        if (!content.length && message.attachments.first()) content = `<attachment:${message.attachments.first()!.name}`

        // Only send typing indicator if chat is enabled
        await message.channel.sendTyping()
        await crimsonChat.sendMessage(content, {
            username: message.author.username,
            displayName: message.member!.displayName,
            serverDisplayName: message.member?.displayName ?? message.author.displayName,
            respondingTo
        }, message)
    })
}
