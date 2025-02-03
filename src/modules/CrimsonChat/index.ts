import { Client, TextChannel, Message, ChatInputCommandInteraction } from 'discord.js'
import { MessageProcessor } from './MessageProcessor'
import { HistoryManager } from './HistoryManager'
import { Logger } from '../../util/logger'
import { promises as fs } from 'fs'
import type { UserMessageOptions } from '../../types/types'
import path from 'path'
import { formatUserMessage, usernamesToMentions } from './utils/formatters'

const logger = new Logger('CrimsonChat')

export default class CrimsonChat {
    private static instance: CrimsonChat
    private historyManager = HistoryManager.getInstance()
    private messageProcessor = MessageProcessor.getInstance()
    private channel: TextChannel | null = null
    private channelId = '1335992675459141632'
    private enabled: boolean = true
    private isProcessing: boolean = false
    private bannedUsers: Set<string> = new Set()
    client: Client | null = null

    public static getInstance(): CrimsonChat {
        if (!CrimsonChat.instance) {
            CrimsonChat.instance = new CrimsonChat()
        }
        return CrimsonChat.instance
    }

    public setClient(client: Client) {
        this.client = client
    }

    public async init(): Promise<void> {
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        logger.info('Initializing CrimsonChat...')
        this.channel = await this.client.channels.fetch(this.channelId) as TextChannel
        if (!this.channel) {
            logger.error('Could not find webhook channel')
            throw new Error('Could not find webhook channel')
        }

        await this.historyManager.init()
        await this.loadBannedUsers()
        logger.ok('CrimsonChat initialized successfully')
    }

    public async sendMessage(content: string, options: UserMessageOptions, originalMessage?: Message): Promise<string | null | undefined> {
        if (!this.channel) throw new Error('Channel not set. Call init() first.')
        if (!this.enabled) return

        const targetChannel = options.targetChannel || this.channel

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
            targetChannel.sendTyping().catch(() => {
                // Ignore errors from sending typing indicator
            })
        }, 8000)

        // Initial typing indicator
        await targetChannel.sendTyping()
        let response = ''

        try {
            response = await this.messageProcessor.processMessage(content, options, originalMessage)
            if (response === null) {
                logger.info('Received ignore command, skipping message send')
                return null
            }
            await this.sendResponseToDiscord(response, null, originalMessage)
        } catch (e) {
            const error = e as Error
            logger.error(`Error processing message: ${error.message}`)
            try {
                await this.sendResponseToDiscord('Sorry, something went wrong while processing your message. Please try again later.')
            } catch (sendError) {
                logger.error(`Failed to send error message: ${sendError}`)
            }
        } finally {
            clearInterval(typingInterval)
            this.isProcessing = false
            logger.info('Message processing completed')
            return response
        }
    }

    private async sendResponseToDiscord(content: string, message?: any, originalMessage?: Message): Promise<void> {
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
        } catch (error: any) {
            logger.error(`Error sending response to Discord: ${error.message}`)
            throw error
        }
    }

    public async handleStartup(): Promise<void> {
        if (!this.channel) return

        const bootMessage = await this.channel.messages.fetch({ limit: 1 })
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
        if (!this.channel) return
        await this.sendResponseToDiscord('Crimson is shutting down...')
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
            interaction.user.username,
            interaction.user.displayName,
            interaction.user.displayName,
            `Used command: ${command}${optionStr}`
        )

        this.historyManager.appendMessage('user', message)
        await this.historyManager.trimHistory()
    }

    public async updateSystemPrompt(): Promise<void> {
        await this.historyManager.updateSystemPrompt()
        logger.info('System prompt updated to latest version')
    }
}
