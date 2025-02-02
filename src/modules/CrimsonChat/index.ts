import { Client, TextChannel, Message, ChatInputCommandInteraction } from 'discord.js'
import { MessageProcessor } from './MessageProcessor'
import { HistoryManager } from './HistoryManager'
import { Logger } from '../../util/logger'
import { promises as fs } from 'fs'
import type { UserMessageOptions } from '../../types/types'
import path from 'path'
import { formatUserMessage } from './utils/formatters'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSON_CHAT_SYSTEM_PROMPT } from '../../util/constants'

const logger = new Logger('CrimsonChat')

export default class CrimsonChat {
    private static instance: CrimsonChat
    private client: Client | null = null
    private thread: TextChannel | null = null
    private threadId = '1333319963737325570'
    private enabled: boolean = true
    private isProcessing: boolean = false
    private bannedUsers: Set<string> = new Set()
    private messageProcessor: MessageProcessor
    private historyManager: HistoryManager
    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private history: any[] = []

    private constructor() {
        this.historyManager = new HistoryManager()
        this.messageProcessor = new MessageProcessor(this.historyManager)
    }

    public static getInstance(): CrimsonChat {
        if (!CrimsonChat.instance) {
            CrimsonChat.instance = new CrimsonChat()
        }
        return CrimsonChat.instance
    }

    public setClient(client: Client) {
        this.client = client
        this.messageProcessor.setClient(client)
    }

    public async init(): Promise<void> {
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('Initializing CrimsonChat...')
        this.thread = await this.client.channels.fetch(this.threadId) as TextChannel
        if (!this.thread) {
            logger.error('Could not find webhook thread')
            throw new Error('Could not find webhook thread')
        }

        await this.historyManager.init()
        await this.loadBannedUsers()
        logger.ok('CrimsonChat initialized successfully')
    }

    public async sendMessage(content: string, options: UserMessageOptions, originalMessage?: Message): Promise<void> {
        if (!this.thread) throw new Error('Thread not set. Call init() first.')
        if (!this.enabled) return

        if (this.isProcessing && originalMessage) {
            logger.warn(`Message from ${options.username} ignored - already processing another message`)
            await originalMessage.react('❌').catch(err => {
                logger.error(`Failed to add reaction: ${err.message}`)
            })
            return
        }

        logger.info(`Processing message from ${options.username}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`)
        this.isProcessing = true

        // Start typing indicator loop
        const typingInterval = setInterval(() => {
            this.thread?.sendTyping().catch(() => {
                // Ignore errors from sending typing indicator
            })
        }, 8000)

        // Initial typing indicator
        await this.thread.sendTyping()

        try {
            const response = await this.messageProcessor.processMessage(content, options, originalMessage)
            await this.sendResponseToDiscord(response, undefined, originalMessage)
        } catch (error: any) {
            logger.error(`Error processing message: ${error.message}`)
            try {
                await this.thread.send('Sorry, something went wrong while processing your message. Please try again later.')
            } catch (sendError) {
                logger.error(`Failed to send error message: ${sendError}`)
            }
        } finally {
            clearInterval(typingInterval)
            this.isProcessing = false
            logger.info('Message processing completed')
        }
    }

    private async sendResponseToDiscord(content: string, message?: any, originalMessage?: Message): Promise<void> {
        if (!this.thread) throw new Error('Thread not set')

        try {
            let finalContent = content

            if (finalContent.length > 2000) {
                const buffer = Buffer.from(finalContent, 'utf-8')
                const messageOptions = {
                    files: [{
                        attachment: buffer,
                        name: 'response.txt'
                    }]
                }

                if (originalMessage?.reply) {
                    await originalMessage.reply(messageOptions)
                } else {
                    await this.thread.send(messageOptions)
                }
            } else {
                if (originalMessage?.reply) {
                    await originalMessage.reply(finalContent)
                } else {
                    await this.thread.send(finalContent)
                }
            }
        } catch (error: any) {
            logger.error(`Error sending response to Discord: ${error.message}`)
            throw error
        }
    }

    public async handleStartup(): Promise<void> {
        if (!this.thread) return

        const bootMessage = await this.thread.messages.fetch({ limit: 1 })
        const lastMessage = bootMessage.first()

        if (lastMessage?.content.includes('Crimson is shutting down...')) {
            await this.sendMessage('I am back online after a restart.', {
                username: 'System',
                displayName: 'System',
                serverDisplayName: 'System'
            })
        }
    }

    public async handleShutdown(): Promise<void> {
        if (!this.thread) return
        await this.thread.send('Crimson is shutting down...')
    }

    public setForceNextBreakdown(force: boolean): void {
        this.messageProcessor.setForceNextBreakdown(force)
        logger.info(`Force next breakdown set to: ${force}`)
    }

    public isEnabled(): boolean {
        return this.enabled
    }

    public setEnabled(state: boolean): void {
        this.enabled = state
        logger.info(`CrimsonChat ${state ? 'enabled' : 'disabled'}`)
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

    private async loadHistory(): Promise<void> {
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedHistory = JSON.parse(data)
            // Always ensure system prompt is first
            this.history = [{
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            }]
            // Add saved messages after system prompt
            this.history.push(...savedHistory.filter((msg: any) => msg.role !== 'system'))
        } catch (error) {
            // If file doesn't exist or is invalid, start with just the system prompt
            this.history = [{
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            }]
        }
    }

    private async saveHistory(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })
            await fs.writeFile(this.historyPath, JSON.stringify(this.history, null, 2))
        } catch (error) {
            console.error('Failed to save chat history:', error)
        }
    }

    public isBanned(userId: string): boolean {
        return this.bannedUsers.has(userId)
    }

    public async banUser(userId: string): Promise<void> {
        this.bannedUsers.add(userId)
        await this.saveBannedUsers()
        logger.info(`Banned user ${userId} from CrimsonChat`)
    }

    public async unbanUser(userId: string): Promise<void> {
        this.bannedUsers.delete(userId)
        await this.saveBannedUsers()
        logger.info(`Unbanned user ${userId} from CrimsonChat`)
    }

    public async clearHistory(): Promise<void> {
        await this.historyManager.clearHistory()
    }

    public async trackCommandUsage(interaction: ChatInputCommandInteraction) {
        const command = `/${interaction.commandName}`
        const options = interaction.options.data
        const optionStr = options.length > 0 
            ? ' ' + options.map((opt) => `${opt.name}:${opt.value ?? '[no value]'}`).join(' ')
            : ''

        const message = await formatUserMessage(
            this.client,
            interaction.user.username,
            interaction.user.displayName,
            interaction.user.displayName,
            `Used command: ${command}${optionStr}`
        )

        this.historyManager.appendMessage('user', message)
        await this.historyManager.trimHistory()
    }

    private async handleRandomBreakdown(): Promise<string | null> {
        if (this.messageProcessor.forceNextBreakdown || Math.random() < this.messageProcessor.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${this.messageProcessor.forceNextBreakdown ? 'forced' : 'random'} Crimson 1 breakdown`)
            this.messageProcessor.forceNextBreakdown = false
            const response = await this.messageProcessor.openai.chat.completions.create({
                messages: [{
                    role: 'system',
                    content: CRIMSON_BREAKDOWN_PROMPT
                }],
                model: 'gpt-4o-mini'
            })

            const breakdown = response.choices[0].message?.content
            if (breakdown) {
                await this.historyManager.appendMessage('assistant', breakdown)
                return breakdown
            }
        }
        return null
    }
}
