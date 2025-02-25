import { Message } from 'discord.js'
import OpenAI from 'openai'
import { ImageProcessor } from './ImageProcessor'
import { CommandParser } from './CommandParser'
import { Logger } from '../../util/logger'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSONCHAT_RESPONSE_SCHEMA, OPENAI_BASE_URL, OPENAI_MODEL } from '../../util/constants'
import type { ChatMessage, Memory, UserMessageOptions, UserStatus, ChatResponseArray } from '../../types/types'
import { HistoryManager } from './HistoryManager'
import CrimsonChat from '.'
import chalk from 'chalk'
import { zodResponseFormat } from 'openai/helpers/zod.mjs'

const logger = new Logger('CrimsonChat | MessageProcessor')

export class MessageProcessor {
    private static instance: MessageProcessor
    private crimsonChat: CrimsonChat
    private historyManager = HistoryManager.getInstance()
    private imageProcessor = new ImageProcessor()

    constructor(crimsonChat: CrimsonChat) {
        this.crimsonChat = crimsonChat
    }

    public static getInstance(crimsonChat: CrimsonChat): MessageProcessor {
        if (!MessageProcessor.instance) {
            MessageProcessor.instance = new MessageProcessor(crimsonChat)
        }
        return MessageProcessor.instance
    }

    commandParser = new CommandParser()
    forceNextBreakdown = false
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
        baseURL: OPENAI_BASE_URL
    })
    readonly BREAKDOWN_CHANCE = 0.01

    async processMessage(content: string, options: UserMessageOptions, originalMessage?: Message): Promise<ChatResponseArray> {
        // Check for random breakdown before normal processing
        const breakdown = await this.handleRandomBreakdown(content, options)
        if (breakdown) return Array.isArray(breakdown) ? breakdown : [breakdown]

        try {
            // Start memory retrieval in parallel with other processing
            const memoriesPromise = this.crimsonChat.memoryManager.retrieveRelevantMemories(content)

            // Wait for memory retrieval
            const relevantMemories = await memoriesPromise
            let memoryContext = ''

            if (relevantMemories.length > 0) {
                memoryContext = this.formatMemoriesForContext(relevantMemories)
                logger.info(`Retrieved ${chalk.cyan(relevantMemories.length)} relevant memories`)
            }

            // Format message in the specified JSON structure
            let messageText = content
            if (content.startsWith('!system ') || content.startsWith('!user ') || content.startsWith('!assistant ')) {
                messageText = content.split(' ').slice(1).join(' ').trim()
            }

            const messageData = {
                username: options.username,
                displayName: options.displayName,
                serverDisplayName: options.serverDisplayName,
                currentTime: new Date().toISOString(),
                text: messageText,
                respondingTo: options.respondingTo ? {
                    targetUsername: options.respondingTo.targetUsername,
                    targetText: options.respondingTo.targetText
                } : undefined,
                userStatus: await this.getUserPresenceAndRoles(options.username),
                guildName: options.guildName,
                channelName: options.channelName,
            }

            // Convert message to string for history
            const formattedMessage = JSON.stringify(messageData)

            // Append user's message to history
            await this.historyManager.appendMessage('user', formattedMessage)

            const history = this.historyManager.prepareHistory().map(msg => ({
                role: msg.role,
                content: msg.content || '',
            })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]

            // Add memory context if available
            if (memoryContext) {
                history.unshift({
                    role: 'system',
                    content: memoryContext
                })
            }

            // Extract image URLs from message content and combine with image attachments
            const imageUrls = new Set<string>()
            if (options.imageAttachments?.length) {
                options.imageAttachments.forEach(url => imageUrls.add(url))
            }

            // Add context messages to history if provided
            if (options.contextMessages?.length) {
                const contextMessages = options.contextMessages.map(msg => ({
                    role: 'user' as const,
                    content: JSON.stringify({
                        username: msg.username,
                        displayName: msg.username,
                        serverDisplayName: msg.username,
                        currentTime: new Date().toISOString(),
                        text: msg.content,
                        userStatus: 'unknown'
                    })
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

            let response = await this.generateAIResponse(history)

            // Handle command if present and generate a new response with the result
            if (response?.command) {
                // Save the initial response that contained the command
                await this.historyManager.appendMessage('assistant', JSON.stringify(response))

                // Add command execution indicator and send to Discord
                const commandIndicator = `-# ℹ️ Assistant command called: ${response.command.name}${response.command.params ? `(${response.command.params.join(', ')})` : ''}`
                if (originalMessage?.channel && 'send' in originalMessage.channel) {
                    await originalMessage.channel.send(commandIndicator)
                }

                const commandResult = await this.commandParser.parseCommand(response.command, originalMessage)
                if (commandResult) {
                    const commandMessage = `Command executed: ${response.command.name}${response.command.params ? `(${response.command.params.join(', ')})` : ''}\nResult: ${commandResult}`

                    // Add command result to history array for context
                    history.push({
                        role: 'system',
                        content: commandMessage
                    })

                    // Save to persistent history
                    await this.historyManager.appendMessage('system', commandMessage)

                    // Get new response with updated history including command result
                    response = await this.generateAIResponse(history)
                }
            }

            if (response) {
                const processedResponse = await this.processResponse(response, options, originalMessage)
                logger.ok('Response processed successfully')
                return processedResponse
            }

            return []

        } catch (e) {
            const error = e as Error
            logger.error(`Error processing AI response: ${chalk.red(error.message)}`)
            throw error
        }
    }

    private async generateAIResponse(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
        const response = await this.openai.beta.chat.completions.parse({
            messages,
            model: OPENAI_MODEL,
            response_format: zodResponseFormat(CRIMSONCHAT_RESPONSE_SCHEMA, 'response')
        })

        return response.choices[0].message.parsed
    }

    private async handleRandomBreakdown(userContent: string, options: UserMessageOptions): Promise<ChatResponseArray | null> {
        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${chalk.yellow(this.forceNextBreakdown ? 'forced' : 'random')} Crimson 1 breakdown`)
            this.forceNextBreakdown = false

            // Save the user's message that triggered the breakdown
            const messageData = {
                username: options.username,
                displayName: options.displayName,
                serverDisplayName: options.serverDisplayName,
                currentTime: new Date().toISOString(),
                text: userContent,
                respondingTo: options.respondingTo,
                userStatus: await this.getUserPresenceAndRoles(options.username),
                guildName: options.guildName,
                channelName: options.channelName,
            }
            await this.historyManager.appendMessage('user', JSON.stringify(messageData))

            // Generate and save the breakdown response
            const breakdown = await this.generateAIResponse([{
                role: 'system',
                content: CRIMSON_BREAKDOWN_PROMPT
            }])

            if (breakdown) {
                // Convert structured response to ChatResponseArray
                const response: ChatResponseArray = []

                // Add text messages
                if (breakdown.replyMessages && breakdown.replyMessages.length > 0) {
                    response.push(...breakdown.replyMessages)
                }

                // Add embed if present
                if (breakdown.embed) {
                    response.push({
                        embed: {
                            ...breakdown.embed,
                            color: breakdown.embed.color ?? 0xFF0000 // Default to red if color not specified
                        }
                    })
                }

                // Save each breakdown message to history
                await this.historyManager.appendMessage('assistant', response)
                return response
            }
            return null
        }
        return null
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

    private async getUserPresenceAndRoles(username: string): Promise<UserStatus | 'unknown'> {
        if (!this.crimsonChat.client) return 'unknown'

        const user = this.crimsonChat.client.users.cache.find(u => u.username === username)
        if (!user) return 'unknown'

        const guild = this.crimsonChat.client.guilds.cache.first()
        if (!guild) return 'unknown'

        try {
            const member = await guild.members.fetch(user.id)
            if (!member) return 'unknown'

            await member.fetch(true)
            const presence = member.presence

            const roles = member.roles.cache.map(role => role.name)
            const activities = presence?.activities?.map(activity => ({
                name: activity.name,
                type: activity.type,
                state: activity.state ?? undefined,
                details: activity.details ?? undefined,
                createdAt: activity.createdAt.toISOString()
            })) || []

            return {
                roles,
                presence: activities.length ? activities : 'offline or no activities'
            }
        } catch (e) {
            const error = e as Error
            logger.error(`Error fetching user status: ${chalk.red(error.message)}`)
            return 'unknown'
        }
    }
    // Add new helper methods for memory handling
    private formatMemoriesForContext(memories: Memory[]): string {
        const formattedMemories = memories
            .sort((a, b) => b.importance - a.importance)
            .map(memory => {
                const importanceLabel = this.getImportanceLabel(memory.importance)
                const timeAgo = this.getTimeAgo(memory.timestamp)
                return `[${importanceLabel}] ${timeAgo}: ${memory.content}`
            })
            .join('\n')

        return `RELEVANT MEMORIES:\n${formattedMemories}\n\nUse these memories to maintain context and personality consistency in your response.`
    }
    private getImportanceLabel(importance: number): string {
        switch (importance) {
            case 5: return 'CRITICAL'
            case 4: return 'IMPORTANT'
            case 3: return 'USEFUL'
            case 2: return 'RELEVANT'
            default: return 'BASIC'
        }
    }
    private getTimeAgo(timestamp: number): string {
        const now = Date.now()
        const seconds = Math.floor((now - timestamp) / 1000)

        if (seconds < 60) return 'under a minute ago'
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
        return `${Math.floor(seconds / 86400)}d ago`
    }

    private async processResponse(content: any, options: UserMessageOptions, originalMessage?: Message): Promise<ChatResponseArray> {
        const response: ChatResponseArray = []

        // Only add text messages and embeds to response, skip raw command outputs
        if (content.replyMessages && content.replyMessages.length > 0) {
            // Filter out any messages that look like raw command output (JSON strings)
            const filteredMessages = content.replyMessages.filter((msg: string) => {
                try {
                    JSON.parse(msg)
                    return false // If it parses as JSON, it's likely a command output
                } catch {
                    return true // Not JSON, safe to send
                }
            })
            response.push(...filteredMessages)
        }

        // Add embed if present
        if (content.embed) {
            response.push({ embed: content.embed })
        }

        // Store all responses in history as a single structured entry
        if (response.length > 0) {
            await this.historyManager.appendMessage('assistant', response)
        }

        return response
    }
}
