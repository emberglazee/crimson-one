import { Client, TextChannel, Message, ChatInputCommandInteraction, type MessageReplyOptions, MessagePayload, EmbedBuilder } from 'discord.js'
import { MessageProcessor } from './MessageProcessor'
import { HistoryManager } from './HistoryManager'
import { Logger } from '../../util/logger'
import { promises as fs } from 'fs'
import type { UserMessageOptions, ChatResponse, ChatResponseArray } from '../../types/types'
import path from 'path'
import { formatUserMessage, usernamesToMentions } from './utils/formatters'
import chalk from 'chalk'
import { MemoryManager } from './MemoryManager'
import { MessageQueue } from './MessageQueue'

const logger = new Logger('CrimsonChat')

export default class CrimsonChat {
    private static instance: CrimsonChat
    public channel: TextChannel | null = null
    private channelId = '1335992675459141632'
    private enabled: boolean = true
    // private isProcessing: boolean = false
    private bannedUsers: Set<string> = new Set()

    memoryManager: MemoryManager = MemoryManager.getInstance()
    messageProcessor: MessageProcessor | null = null
    historyManager: HistoryManager
    client: Client | null = null

    private constructor() {
        this.historyManager = HistoryManager.getInstance()
    }

    public static getInstance(): CrimsonChat {
        if (!CrimsonChat.instance) {
            CrimsonChat.instance = new CrimsonChat()
        }
        return CrimsonChat.instance
    }

    private getMessageProcessor(): MessageProcessor {
        if (!this.messageProcessor) {
            this.messageProcessor = new MessageProcessor(this)
        }
        return this.messageProcessor
    }

    public setClient(client: Client) {
        this.client = client
    }

    public async init(): Promise<void> {
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('Initializing CrimsonChat...')
        this.channel = await this.client.channels.fetch(this.channelId) as TextChannel
        if (!this.channel) {
            logger.error(`Could not find text channel ${chalk.yellow(this.channelId)}`)
            throw new Error(`Could not find text channel ${chalk.yellow(this.channelId)}`)
        }

        await this.historyManager.init()
        await this.memoryManager.init()
        await this.loadBannedUsers()
        logger.ok('CrimsonChat initialized successfully')
    }

    public async sendMessage(content: string, options: UserMessageOptions, originalMessage?: Message): Promise<ChatResponseArray | null | undefined> {
        if (!this.channel) throw new Error('Channel not set. Call init() first.')
        if (!this.enabled) return

        const targetChannel = options.targetChannel || this.channel
        logger.info(`Processing message from ${chalk.yellow(options.username)}: ${chalk.yellow(content.substring(0, 50) + (content.length > 50) ? '...' : '')}`)

        // Start typing indicator loop - only for initial processing
        const typingInterval = setInterval(() => {
            targetChannel.sendTyping().catch(e => {
                logger.warn(`Failed to send typing indicator: ${chalk.yellow(e.message)}`)
            })
        }, 8000)

        // Initial typing indicator
        await targetChannel.sendTyping()
        let response: ChatResponseArray = []

        try {
            response = await this.getMessageProcessor().processMessage(content, options, originalMessage)
            if (!response) {
                logger.info('Received null/undefined response from message processor, ignoring')
                return null
            }

            // Clear typing indicators before sending messages
            clearInterval(typingInterval)

            // Split response handling based on whether a command exists
            const commandIndex = response.findIndex(msg => typeof msg === 'object' && 'command' in msg)
            const hasCommand = commandIndex !== -1

            if (hasCommand) {
                // Cast the command message with type assertion
                const commandMsg = (response[commandIndex] as any).command as { name: string; params?: string[] }

                // Send messages before the command
                for (let i = 0; i < commandIndex; i++) {
                    const msg = response[i]
                    await this.sendResponseToDiscord(msg, targetChannel, i === 0 ? originalMessage : undefined)
                }

                if (commandMsg.name !== 'noOp') {
                    // Send command execution indicator
                    const commandIndicator = `-# ℹ️ Assistant command called: ${commandMsg.name}${commandMsg.params ? `(${commandMsg.params.join(', ')})` : ''}`
                    await this.sendResponseToDiscord(commandIndicator, targetChannel)
                }

                // Process the command
                const commandResult = await this.getMessageProcessor().commandParser.parseCommand(commandMsg, originalMessage)
                if (commandResult) {
                    await this.sendResponseToDiscord(commandResult, targetChannel)
                }

                // Send remaining messages after the command
                for (let i = commandIndex + 1; i < response.length; i++) {
                    const msg = response[i]
                    await this.sendResponseToDiscord(msg, targetChannel)
                }
            } else {
                // Process messages normally if no command exists
                for (const [index, msg] of response.entries()) {
                    await this.sendResponseToDiscord(msg, targetChannel, index === 0 ? originalMessage : undefined)
                }
            }

            return response
        } catch (e) {
            const error = e as Error
            clearInterval(typingInterval)
            
            // Special handling for timeout errors
            if (error.message.includes('Response timeout')) {
                const timeoutMessage = "⚠️ 30 second timeout reached for processing message"
                await this.sendResponseToDiscord(timeoutMessage, targetChannel)
                return null
            }
            
            logger.error(`Error processing message: ${chalk.red(error.message)}`)
            await this.sendResponseToDiscord(`⚠️ Error processing message! -> \`${error.message}\``, targetChannel)
            return null
        } finally {
            clearInterval(typingInterval)
            logger.ok('Message processing completed')
        }
    }

    private async sendResponseToDiscord(response: ChatResponse, targetChannel: TextChannel, originalMessage?: Message): Promise<void> {
        if (!this.client) throw new Error('Client not set')

        const messageQueue = MessageQueue.getInstance()

        try {
            // Handle embed objects
            if (typeof response === 'object' && 'embed' in response && response.embed) {
                const embed = new EmbedBuilder()
                    .setTitle(response.embed.title ?? null)
                    .setDescription(response.embed.description ?? null)
                    .setColor(response.embed.color)

                if (response.embed.fields && response.embed.fields.length > 0) {
                    embed.addFields(response.embed.fields)
                }

                const messageOptions = {
                    embeds: [embed],
                    allowedMentions: { repliedUser: true }
                }

                await messageQueue.queueMessage(messageOptions, targetChannel, originalMessage)
                return
            }

            // At this point, response must be a string
            const finalContent = await usernamesToMentions(this.client, response as string)

            // If content is empty, send a placeholder message
            const content = finalContent.trim() || '-# ...'

            // Split message if longer than Discord's limit
            const messages = this.splitMessage(content)

            for (const message of messages) {
                if (message.length > 2000) {
                    // Send as file attachment if still too long
                    const buffer = Buffer.from(message, 'utf-8')
                    const messageOptions: MessagePayload | MessageReplyOptions = {
                        files: [{
                            attachment: buffer,
                            name: 'response.txt'
                        }],
                        allowedMentions: { repliedUser: true }
                    }

                    await messageQueue.queueMessage(messageOptions, targetChannel, originalMessage)
                } else {
                    const messageOptions = {
                        content: message,
                        allowedMentions: { repliedUser: true }
                    }

                    await messageQueue.queueMessage(messageOptions, targetChannel, originalMessage)
                }
                // Only use reply functionality for first message part
                originalMessage = undefined
            }
        } catch (e) {
            const error = e as Error
            logger.error(`Error sending response to Discord: ${chalk.red(error.message)}`)
            throw error
        }
    }

    private splitMessage(text: string): string[] {
        // If message is under limit, return as is
        if (text.length <= 2000) return [text]

        const messages: string[] = []
        let currentMessage = ''
        const lines = text.split('\n')

        for (const line of lines) {
            if (currentMessage.length + line.length + 1 <= 2000) {
                currentMessage += (currentMessage ? '\n' : '') + line
            } else {
                // Push current message if not empty
                if (currentMessage) {
                    messages.push(currentMessage)
                }
                // Start new message
                currentMessage = line

                // If single line is too long, split by characters
                if (line.length > 2000) {
                    const chunks = line.match(/.{1,2000}/g) || []
                    messages.push(...chunks)
                    currentMessage = ''
                }
            }
        }

        // Push final message if any
        if (currentMessage) {
            messages.push(currentMessage)
        }

        return messages
    }

    public async handleStartup(): Promise<void> {
        if (!this.channel) return
        await this.sendMessage(`Discord bot initialized. Welcome back, Crimson 1! Time: ${new Date().toISOString()}`, {
            username: 'system',
            displayName: 'System',
            serverDisplayName: 'System'
        })
    }

    public async handleShutdown(): Promise<void> {
        if (!this.channel) return
        await this.sendResponseToDiscord('⚠️ Crimson is shutting down...', this.channel)
        // Append message without sending it, it won't have time to respond so don't bother trying
        await this.historyManager.appendMessage('system', `Discord bot is shutting down. See ya in a bit, Crimson 1. Time: ${new Date().toISOString()}`)
    }

    public setForceNextBreakdown(force: boolean): void {
        this.messageProcessor!.setForceNextBreakdown(force)
        logger.ok(`Force next breakdown set to: ${chalk.yellow(force)}`)
    }

    public isEnabled(): boolean {
        return this.enabled
    }

    public setEnabled(state: boolean): void {
        this.enabled = state
        logger.info(`CrimsonChat ${chalk.yellow(state ? 'enabled' : 'disabled')}`)
    }

    private async loadBannedUsers(): Promise<void> {
        const bannedUsersPath = path.join(process.cwd(), 'data/banned_users.json')
        try {
            const data = await fs.readFile(bannedUsersPath, 'utf-8')
            this.bannedUsers = new Set(JSON.parse(data))
        } catch (error) {
            this.bannedUsers = new Set()
        }
    }

    private async saveBannedUsers(): Promise<void> {
        const bannedUsersPath = path.join(process.cwd(), 'data/banned_users.json')
        try {
            await fs.mkdir(path.dirname(bannedUsersPath), { recursive: true })
            await fs.writeFile(bannedUsersPath, JSON.stringify([...this.bannedUsers]))
        } catch (error) {
            console.error('Failed to save banned users:', error)
        }
    }

    public isBanned(userId: string): boolean {
        return this.bannedUsers.has(userId)
    }

    public async banUser(userId: string): Promise<void> {
        this.bannedUsers.add(userId)
        await this.saveBannedUsers()
        logger.ok(`Banned user ${chalk.yellow(userId)}`)
    }

    public async unbanUser(userId: string): Promise<void> {
        this.bannedUsers.delete(userId)
        await this.saveBannedUsers()
        logger.ok(`Unbanned user ${chalk.yellow(userId)}`)
    }

    public async clearHistory(): Promise<void> {
        await this.historyManager.clearHistory()
        logger.info('History cleared')
    }

    public async clearMemories(): Promise<void> {
        await this.memoryManager.clearMemories()
        logger.info('Memories cleared')
    }

    public async trackCommandUsage(interaction: ChatInputCommandInteraction) {
        const command = `/${interaction.commandName}`
        const options = interaction.options.data
        const optionStr = options.length > 0 
            ? ' ' + options.map((opt) => `${opt.name}:${opt.value ?? '[no value]'}`).join(' ')
            : ''

        const message = await formatUserMessage(
            interaction.user.username,
            interaction.user.displayName,
            interaction.user.displayName,
            `Used command: ${command}${optionStr} (deferred: ${interaction.deferred})`
        )

        this.historyManager.appendMessage('user', message)
        await this.historyManager.trimHistory()
    }

    public async updateSystemPrompt(): Promise<void> {
        await this.historyManager.updateSystemPrompt()
        logger.ok('System prompt updated to latest version')
    }
}
