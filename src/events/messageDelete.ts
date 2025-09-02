import { Client, Message } from 'discord.js'
import { CrimsonChat } from '../modules'

export default function onMessageDelete(client: Client, crimsonChat: CrimsonChat) {
    client.on('messageDelete', async message => {
        // Check if message is in CrimsonChat channel
        if (message.channel.id !== '1335992675459141632') return

        // Ensure message is cached and not partial
        if (!message.partial) {
            const deletedMessage = message as Message

            const content = `Message Delete Event\n\`\`\`json\n${JSON.stringify({
                type: 'messageDelete',
                author: deletedMessage.author.username,
                content: deletedMessage.content
            }, null, 2)}\n\`\`\``
            crimsonChat.sendMessage(content, {
                username: 'System',
                displayName: 'Message Delete',
                serverDisplayName: 'Message Delete',
                messageContent: content
            })
        }
    })
}
