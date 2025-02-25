import { Message } from 'discord.js'
import { COMMAND_PREFIX, ADMIN_COMMANDS, CRIMSON_CHAT_SYSTEM_PROMPT, ASSISTANT_COMMANDS } from '../../util/constants'
import CrimsonChat from '../CrimsonChat'
import { Logger } from '../../util/logger'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | AdminCommands')
const ADMIN_USER_ID = '341123308844220447'

export class AdminCommandHandler {
    crimsonChat: CrimsonChat
    constructor() {
        this.crimsonChat = CrimsonChat.getInstance()
    }

    public async handleCommand(message: Message): Promise<boolean> {
        if (message.author.id !== ADMIN_USER_ID) return false

        const fullCommand = message.content.slice(COMMAND_PREFIX.length)
        const [command, ...args] = fullCommand.split(' ')
        
        try {
            switch (command) {
                case ADMIN_COMMANDS.RESET:
                    await this.crimsonChat.clearHistory()
                    await message.react('✅')
                    return true

                case ADMIN_COMMANDS.RESET_MEMORIES:
                    await this.crimsonChat.clearMemories()
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

                case ADMIN_COMMANDS.HELP:
                    const commandName = message.content.split(' ')[1]
                    if (!commandName) {
                        await message.react('❌')
                        return true
                    }

                    // Validate the command exists
                    if (!(commandName in ASSISTANT_COMMANDS)) {
                        await message.react('❌')
                        await message.reply(`Error: ${commandName} is not a valid assistant command. Valid commands: ${Object.keys(ASSISTANT_COMMANDS).join(', ')}`)
                        return true
                    }

                    await message.react('⏱️')

                    // Add help text as system message
                    let helpText = `Let me help you understand how to use that command.\n\n`
                    switch(commandName) {
                        case ASSISTANT_COMMANDS.FETCH_ROLES:
                        case ASSISTANT_COMMANDS.FETCH_USER:
                        case ASSISTANT_COMMANDS.GET_RICH_PRESENCE:
                            helpText += `The command requires a username parameter: \`{ command: { name: '${commandName}', params: ['username'] } }\``
                            break
                        case ASSISTANT_COMMANDS.CREATE_CHANNEL:
                            helpText += `The command requires a channel name parameter: \`{ command: { name: '${commandName}', params: ['channel-name'] } }\``
                            break
                        case ASSISTANT_COMMANDS.TIMEOUT_MEMBER:
                            helpText += `The command requires a username to timeout: \`{ command: { name: '${commandName}', params: ['username'] } }\``
                            break
                        default:
                            helpText += `The command is used as follows: \`{ command: { name: '${commandName}', params: [] } }\``
                    }
                    helpText += `\n\nThe command parameters are provided as an array of strings.`

                    await this.crimsonChat.historyManager.appendMessage('system', helpText)

                    // Let the normal message processing flow handle the demonstration
                    const demoParam = commandName === ASSISTANT_COMMANDS.CREATE_CHANNEL ? 'new-channel' : message.author.username
                    await this.crimsonChat.messageProcessor!.processMessage(
                        `Let me demonstrate the ${commandName} command for you.`,
                        {
                            username: 'System',
                            displayName: 'System',
                            serverDisplayName: 'System'
                        },
                        message
                    )

                    await message.react('✅')
                    return true

                case ADMIN_COMMANDS.BAN:
                case ADMIN_COMMANDS.UNBAN:
                    const userId = args[0]
                    if (!userId) {
                        await message.react('❌')
                        return true
                    }

                    if (command === ADMIN_COMMANDS.BAN) {
                        await this.crimsonChat.banUser(userId)
                    } else {
                        await this.crimsonChat.unbanUser(userId)
                    }

                    await message.react('✅')
                    const user = await this.crimsonChat.client!.users.fetch(userId)
                    await this.crimsonChat.sendMessage(
                        `User ${user.username} has been ${command === ADMIN_COMMANDS.BAN ? 'banned' : 'unbanned'}, you are now ${command === ADMIN_COMMANDS.BAN ? 'not ' : ''}able to see their messages.`,
                        { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                    )
                    return true
            }
        } catch (e) {
            const error = e as Error
            logger.error(`Error handling admin command ${chalk.yellow(command)}! -> ${chalk.red(error.message)}`)
            await message.react('❌')
        }

        return false
    }
}
