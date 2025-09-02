import { Client, Message } from 'discord.js'
import { CrimsonChat } from '../modules'

export default function onMessageUpdate(client: Client) {
    client.on('messageUpdate', async (oldMessage, newMessage) => {
        // Check if message is in CrimsonChat channel
        if (newMessage.channel.id !== '1335992675459141632') return

        // Ensure messages are cached and not partial
        if (!oldMessage.partial && !newMessage.partial) {
            const old = oldMessage as Message
            const current = newMessage as Message

            // Skip if content hasn't changed
            if (old.content === current.content) return

            const content = `Message Edit Event\n\`\`\`json\n${JSON.stringify({
                type: 'messageEdit',
                author: current.author.username,
                before: old.content,
                after: current.content
            }, null, 2)}\n\`\`\``
            CrimsonChat.getInstance().sendMessage(content, {
                username: 'System',
                displayName: 'Message Edit',
                serverDisplayName: 'Message Edit',
                messageContent: content
            }, current)
        }
    })
}
