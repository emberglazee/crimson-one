import { Client, Message } from 'discord.js'
import CrimsonChat from '../modules/CrimsonChat'

export default function onMessageDelete(client: Client) {
    client.on('messageDelete', async (message) => {
        // Check if message is in CrimsonChat thread
        if (message.channel.id !== '1333319963737325570') return
        
        // Ensure message is cached and not partial
        if (!message.partial) {
            const deletedMessage = message as Message

            // Send deletion notification through CrimsonChat
            const chatInstance = CrimsonChat.getInstance()
            await chatInstance.sendMessage(`Message Delete Event\n\`\`\`json\n${JSON.stringify({
                type: 'messageDelete',
                author: deletedMessage.author.username,
                content: deletedMessage.content
            }, null, 2)}\n\`\`\``, {
                username: 'System',
                displayName: 'Message Delete',
                serverDisplayName: 'Message Delete'
            })
        }
    })
}
