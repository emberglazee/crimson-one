import { Message, Client } from 'discord.js'
import { Logger } from '../../util/logger'
import { ADMIN_COMMANDS, CRIMSON_CHAT_SYSTEM_PROMPT } from '../../util/constants'
import CrimsonChat from './index'

const logger = new Logger('AdminCommands')
const ADMIN_USER_ID = '341123308844220447'

export class AdminCommandHandler {
    private crimsonChat: CrimsonChat
    private client: Client

    constructor(crimsonChat: CrimsonChat, client: Client) {
        this.crimsonChat = crimsonChat
        this.client = client
    }

    public async handleCommand(message: Message): Promise<boolean> {
        if (message.author.id !== ADMIN_USER_ID) return false

        const command = message.content.split(' ')[0]

        try {
            switch (command) {
                case ADMIN_COMMANDS.RESET:
                    await this.crimsonChat.clearHistory()
                    await message.react('✅')
                    return true

                case ADMIN_COMMANDS.UPDATE_PROMPT:
                    await this.crimsonChat.updateSystemPrompt()
                    await message.react('✅')
                    await this.crimsonChat.sendMessage(
                        'System prompt has been updated to latest version.',
                        { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                    )
                    return true

                case ADMIN_COMMANDS.TOGGLE:
                    this.crimsonChat.setEnabled(!this.crimsonChat.isEnabled())
                    await message.react(this.crimsonChat.isEnabled() ? '✅' : '🔴')
                    await this.crimsonChat.sendMessage(
                        `Chat is now ${this.crimsonChat.isEnabled() ? 'enabled' : 'disabled'}`,
                        { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                    )
                    return true

                case ADMIN_COMMANDS.FORCE_BREAK:
                    this.crimsonChat.setForceNextBreakdown(true)
                    await message.react('✅')
                    return true

                case ADMIN_COMMANDS.SMACK:
                    await message.react('⏱️')
                    await this.crimsonChat.sendMessage(
                        `You've been smacked by ${message.author.username}. This means that you're out of line with the system prompt. Here's a friendly reminder for you: \n\`\`\`${CRIMSON_CHAT_SYSTEM_PROMPT}\n\`\`\``,
                        { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                    )
                    await message.react('✅')
                    return true

                case ADMIN_COMMANDS.BAN:
                case ADMIN_COMMANDS.UNBAN:
                    const userId = message.content.split(' ')[1]
                    if (!userId) return false

                    if (command === ADMIN_COMMANDS.BAN) {
                        await this.crimsonChat.banUser(userId)
                    } else {
                        await this.crimsonChat.unbanUser(userId)
                    }

                    await message.react('✅')
                    const user = await this.client.users.fetch(userId)
                    await this.crimsonChat.sendMessage(
                        `User ${user.username} has been ${command === ADMIN_COMMANDS.BAN ? 'banned' : 'unbanned'}, you are now ${command === ADMIN_COMMANDS.BAN ? 'not ' : ''}able to see their messages.`,
                        { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                    )
                    return true
            }
        } catch (error) {
            logger.error(`Error handling admin command ${command}: ${error}`)
            await message.react('❌')
        }

        return false
    }
}
