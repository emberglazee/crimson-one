import { Client, TextChannel, Message, ChatInputCommandInteraction } from 'discord.js'
import { MessageProcessor } from './MessageProcessor'
import { HistoryManager } from './HistoryManager'
import { Logger } from '../../util/logger'
import { promises as fs } from 'fs'
import type { UserMessageOptions } from '../../types/types'
import path from 'path'
import { formatUserMessage, usernamesToMentions } from './utils/formatters'
import chalk from 'chalk'
import { MemoryManager } from './MemoryManager'

const logger = new Logger('CrimsonChat')

export default class CrimsonChat {
    private static instance: CrimsonChat
    private channel: TextChannel | null = null
    private channelId = '1335992675459141632'
    private enabled: boolean = true
    private isProcessing: boolean = false
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

    public async sendMessage(content: string, options: UserMessageOptions, originalMessage?: Message): Promise<string | null | undefined> {
        if (!this.channel) throw new Error('Channel not set. Call init() first.')
        if (!this.enabled) return

        const targetChannel = options.targetChannel || this.channel

        // if (this.isProcessing && originalMessage) {
        //     logger.warn(`Message from ${chalk.yellow(options.username)} ignored - already processing another message`)
        //     await originalMessage.react('❌').catch(err => {
        //         logger.error(`Failed to add reaction: ${chalk.red(err.message)}`)
        //     })
        //     return
        // }

        logger.info(`Processing message from ${chalk.yellow(options.username)}: ${chalk.yellow(content.substring(0, 50) + (content.length > 50) ? '...' : '')}`)
        this.isProcessing = true

        // Start typing indicator loop
        const typingInterval = setInterval(() => {
            targetChannel.sendTyping()
        }, 8000)

        // Initial typing indicator
        await targetChannel.sendTyping()
        let response: string | null | undefined = ''

        try {
            response = await this.getMessageProcessor().processMessage(content, options, originalMessage)
            if (!response) {
                logger.info('Received null/undefined response from message processor, ignoring')
                return null
            }
            await this.sendResponseToDiscord(response, originalMessage)
        } catch (e) {
            const error = e as Error
            logger.error(`Error processing message: ${chalk.red(error.message)}`)
            await this.sendResponseToDiscord('Sorry, something went wrong while processing your message. Please try again later.')
        } finally {
            clearInterval(typingInterval)
            this.isProcessing = false
            logger.ok('Message processing completed')
            return response
        }
    }

    private async sendResponseToDiscord(content: string, originalMessage?: Message): Promise<void> {
        if (!this.channel || !this.client) throw new Error('Channel or client not set')

        try {
            let finalContent = await usernamesToMentions(this.client, content)

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
                    await this.channel.send(messageOptions)
                }
            } else {
                const messageOptions = {
                    content: finalContent
                }

                if (originalMessage?.reply) {
                    await originalMessage.reply(messageOptions)
                } else {
                    await this.channel.send(messageOptions)
                }
            }
        } catch (e) {
            const error = e as Error
            logger.error(`Error sending response to Discord: ${chalk.red(error.message)}`)
            throw error
        }
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
        await this.sendResponseToDiscord('⚠️ Crimson is shutting down...')
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
