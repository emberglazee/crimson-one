import { Message } from 'discord.js'
import OpenAI from 'openai'
import { ImageProcessor } from './ImageProcessor'
import { CommandParser } from './CommandParser'
import { Logger } from '../../util/logger'
import { CRIMSON_BREAKDOWN_PROMPT, getAssistantCommandRegex } from '../../util/constants'
import type { ChatMessage, Memory, UserMessageOptions, UserStatus } from '../../types/types'
import { HistoryManager } from './HistoryManager'
import CrimsonChat from '.'
import chalk from 'chalk'

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
        apiKey: process.env.OPENAI_API_KEY
    })
    readonly BREAKDOWN_CHANCE = 0.01

    async processMessage(content: string, options: UserMessageOptions, originalMessage?: Message): Promise<string | null | undefined> {
        // Check for random breakdown before normal processing
        const breakdown = await this.handleRandomBreakdown(content, options)
        if (breakdown) return breakdown

        try {
            // Start memory retrieval in parallel with other processing
            const memoriesPromise = this.crimsonChat.memoryManager.retrieveRelevantMemories(content)

            // Check for any commands in the text, not just at start of line
            const commandRegex = getAssistantCommandRegex()
            const match = commandRegex.exec(content)

            if (match) {
                logger.info(`{processMessage} Found command: ${chalk.yellow(match[0])}`)
                const commandResult = await this.checkForCommands(match[0], originalMessage)
                if (commandResult) {
                    // Feed command result back as a System message
                    const systemFeedback = `!${match[0].split('!')[1].trim()} -> ${commandResult}`

                    return await this.processMessage(
                        systemFeedback,
                        {
                            username: 'System',
                            displayName: 'System',
                            serverDisplayName: 'System'
                        },
                        originalMessage
                    )
                }
            }

            // Wait for memory retrieval only at this point
            const relevantMemories = await memoriesPromise
            let memoryContext = ''

            if (relevantMemories.length > 0) {
                memoryContext = this.formatMemoriesForContext(relevantMemories)
                logger.info(`Retrieved ${chalk.cyan(relevantMemories.length)} relevant memories`)
            }

            // Format message in the specified JSON structure
            const messageData = {
                username: options.username,
                displayName: options.displayName,
                serverDisplayName: options.serverDisplayName,
                currentTime: new Date().toISOString(),
                text: content,
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
                        displayName: msg.username, // Fallback since we don't have historical display names
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

            const responseContent = await this.generateAIResponse(history)

            // Check if AI's response is a command
            if (responseContent.trim().startsWith('!')) {
                logger.info('{processMessage} AI response is a command, executing internally')

                // Save the command to history
                await this.historyManager.appendMessage('assistant', responseContent)

                // `createChannel` specific checks
                if (responseContent.startsWith('!createChannel')) {
                    if (!originalMessage) {
                        return 'Error: No original message available, cannot fetch guild.'
                    }
                    const guild = originalMessage.guild
                    if (!guild) {
                        return 'Error: Guild not found in `originalMessage`.'
                    }
                }

                const commandResult = await this.checkForCommands(responseContent, originalMessage)
                if (commandResult) {
                    // Feed command result back as a System message
                    const systemFeedback = `!${responseContent.split('!')[1].trim()} -> ${commandResult}`

                    return await this.processMessage(
                        systemFeedback,
                        {
                            username: 'System',
                            displayName: 'System',
                            serverDisplayName: 'System'
                        },
                        originalMessage
                    )
                }
            }

            // For non-command responses, save and process memory asynchronously
            if (!responseContent.trim().startsWith('!')) {
                await this.historyManager.appendMessage('assistant', responseContent)
                // Don't await memory processing, but still pass context from the user's message
                void this.crimsonChat.memoryManager.evaluateAndStore(responseContent, content)
                return responseContent
            }

            // For command responses, just save to history without memory processing
            await this.historyManager.appendMessage('assistant', responseContent)
            return responseContent
        } catch (e) {
            const error = e as Error
            logger.error(`Error processing message: ${chalk.red(error.message)}`)
            return 'Error processing message'
        }
    }

    private async generateAIResponse(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<string> {
        const response = await this.openai.chat.completions.create({
            messages,
            model: 'gpt-4o-mini'
        })
        return response.choices[0].message?.content || 'Error processing message'
    }

    private async handleRandomBreakdown(userContent: string, options: UserMessageOptions): Promise<string | null> {
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
            await this.historyManager.appendMessage('assistant', breakdown)

            return breakdown
        }
        return null
    }

    private async checkForCommands(content: string, originalMessage?: Message): Promise<string | null> {
        logger.info(`{processMessage} Checking content for commands: ${chalk.yellow(content)}`)

        const commandRegex = getAssistantCommandRegex()
        const match = commandRegex.exec(content.trim())

        if (!match) {
            logger.info(`{processMessage} No command pattern found in content`)
            return null
        }

        const [fullMatch] = match
        logger.info(`{processMessage} Found command pattern: ${chalk.yellow(fullMatch)}`)

        const commandResult = await this.commandParser.parseCommand(fullMatch, originalMessage)
        if (!commandResult) {
            logger.info(`{processMessage} Command parser returned null`)
            return null
        }

        logger.info(`{processMessage} Command executed successfully`)
        return commandResult
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
}
