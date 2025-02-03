import { Client, Message } from 'discord.js'
import OpenAI from 'openai'
import { ImageProcessor } from './ImageProcessor'
import { CommandParser } from './CommandParser'
import { formatUserMessage } from './utils/formatters'
import { Logger } from '../../util/logger'
import { CRIMSON_BREAKDOWN_PROMPT } from '../../util/constants'
import type { ChatMessage, UserMessageOptions } from '../../types/types'
import { HistoryManager } from './HistoryManager'

const logger = new Logger('MessageProcessor')

export class MessageProcessor {
    private client: Client | null = null
    openai: OpenAI
    private imageProcessor: ImageProcessor
    private commandParser: CommandParser
    private historyManager: HistoryManager
    forceNextBreakdown: boolean = false
    readonly BREAKDOWN_CHANCE = 0.01

    constructor(historyManager: HistoryManager) {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        })
        this.imageProcessor = new ImageProcessor()
        this.commandParser = new CommandParser()
        this.historyManager = historyManager
    }

    setClient(client: Client) {
        this.client = client
        this.commandParser.setClient(client)
    }

    async processMessage(content: string, options: UserMessageOptions, originalMessage?: Message): Promise<string> {
        // Check for breakdown first
        const breakdown = await this.handleRandomBreakdown()
        if (breakdown) {
            return breakdown
        }

        // Extract image URLs from message content and combine with image attachments
        const imageUrls = new Set<string>()
        if (options.imageAttachments?.length) {
            options.imageAttachments.forEach(url => imageUrls.add(url))
        }

        const formattedMessage = await formatUserMessage(
            this.client,
            options.username,
            options.displayName,
            options.serverDisplayName,
            content,
            options.respondingTo
        )

        // Get conversation history and properly map it for OpenAI API
        const history = this.historyManager.prepareHistory().map(msg => ({
            role: msg.role,
            content: msg.content || '',
        })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]

        // Add context messages to history if provided
        if (options.contextMessages?.length) {
            const contextMessages = options.contextMessages.map(msg => ({
                role: 'user' as const,
                content: `${msg.username}: ${msg.content}`
            }))
            
            // Add a system message to indicate context start
            history.push({
                role: 'system',
                content: '[ Previous conversation context from this channel: ]'
            })
            
            // Add context messages
            history.push(...contextMessages)
            
            // Add a system message to indicate context end
            history.push({
                role: 'system',
                content: '[ End of context. Current message: ]'
            })
        }

        const messageForCompletion = await this.parseMessagesForChatCompletion(
            formattedMessage, 
            Array.from(imageUrls)
        )

        history.push(messageForCompletion as OpenAI.Chat.Completions.ChatCompletionMessageParam)

        let response = await this.openai.chat.completions.create({
            messages: history,
            model: 'gpt-4o-mini'
        })

        const { content: parsedResponse, hadCommands } = await this.parseAssistantReply(response.choices[0].message)

        // Save the exchange to history
        await this.historyManager.appendMessage('user', formattedMessage)
        if (parsedResponse) {
            await this.historyManager.appendMessage('assistant', parsedResponse)
        }

        return parsedResponse || 'Error processing message'
    }

    private async handleRandomBreakdown(): Promise<string | null> {
        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${this.forceNextBreakdown ? 'forced' : 'random'} Crimson 1 breakdown`)
            this.forceNextBreakdown = false
            const response = await this.openai.chat.completions.create({
                messages: [{
                    role: 'system',
                    content: CRIMSON_BREAKDOWN_PROMPT
                }],
                model: 'gpt-4o-mini'
            })

            return response.choices[0].message?.content || null
        }
        return null
    }

    private async parseAssistantReply(message: OpenAI.Chat.Completions.ChatCompletionMessage): Promise<{ content: string | null; hadCommands: boolean }> {
        try {
            const content = message.content
            if (!content) return { content: null, hadCommands: false }

            const commandRegex = /!(fetchRoles|fetchUser|getRichPresence|ignore|getEmojis)(?:\(([^)]+)\))?/g
            const commands = Array.from(content.matchAll(commandRegex))

            if (!commands.length) return { content, hadCommands: false }

            let modifiedContent = content
            for (const [fullMatch, command, params] of commands) {
                const response = await this.commandParser.parseCommand(fullMatch)
                if (response === null) return { content: null, hadCommands: true }
                modifiedContent = modifiedContent.replace(fullMatch, `${fullMatch} -> ${response}`)
            }

            return { content: modifiedContent, hadCommands: true }
        } catch (error: any) {
            logger.error(`Error in parseAssistantReply: ${error.message}`)
            throw error
        }
    }

    private async parseMessagesForChatCompletion(content: string, attachments: string[] = []): Promise<ChatMessage> {
        if (!attachments.length) {
            return { role: 'user', content: [{ type: 'text', text: content || '' }] }
        }

        const messageContent: Array<OpenAI.Chat.Completions.ChatCompletionContentPart> = [
            { type: 'text', text: content || '' }
        ]

        const processedUrls = new Set<string>()

        for (const attachmentUrl of attachments) {
            const cleanUrl = this.imageProcessor.cleanImageUrl(attachmentUrl)
            const normalizedUrl = this.imageProcessor.normalizeUrl(cleanUrl)
            
            if (!processedUrls.has(normalizedUrl)) {
                processedUrls.add(normalizedUrl)
                const base64Image = await this.imageProcessor.fetchAndConvertToBase64(cleanUrl)
                if (base64Image) {
                    messageContent.push({
                        type: 'image_url',
                        image_url: { url: base64Image }
                    })
                }
            }
        }

        return { role: 'user', content: messageContent }
    }

    public setForceNextBreakdown(force: boolean): void {
        this.forceNextBreakdown = force
    }

    private async getUserPresenceAndRoles(userId: string) {
        if (!this.client) return null
        const guild = this.client.guilds.cache.first()
        if (!guild) return null
        
        try {
            const member = await guild.members.fetch(userId)
            if (!member) return null

            await member.fetch(true)
            const presence = member.presence

            const roles = member.roles.cache.map(role => role.name)
            const activities = presence?.activities?.map(activity => ({
                name: activity.name,
                type: activity.type,
                state: activity.state,
                details: activity.details,
                createdAt: activity.createdAt
            })) || []

            return {
                roles,
                presence: activities.length ? activities : 'offline or no activities'
            }
        } catch (error) {
            logger.error(`Error fetching user presence/roles: ${error}`)
            return null
        }
    }

    private async parseMentions(text: string): Promise<string> {
        if (!this.client) throw new Error('Client not set')

        const mentionRegex = /<@!?(\d+)>/g
        let parsedText = text
        const mentions = text.matchAll(mentionRegex)

        for (const match of mentions) {
            const userId = match[1]
            try {
                const user = await this.client.users.fetch(userId)
                parsedText = parsedText.replace(match[0], `@${user.username}`)
            } catch (error) {
                console.error(`Could not fetch user ${userId}:`, error)
            }
        }

        return parsedText
    }
}
