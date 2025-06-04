import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | MessageProcessor')

import OpenAI from 'openai'
import { ImageProcessor } from './ImageProcessor'
import { CommandParser } from './CommandParser'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSONCHAT_RESPONSE_SCHEMA, OPENAI_BASE_URL, OPENAI_MODEL } from '../../util/constants'
import type { ChatMessage, UserMessageOptions, UserStatus, ChatResponseArray } from '../../types/types'
import { HistoryManager } from './HistoryManager'
import CrimsonChat from '.'
import { zodResponseFormat } from 'openai/helpers/zod.mjs'
import z from 'zod'
import type { Message } from 'discord.js'

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
            // Format message in the specified JSON structure
            const messageText = content

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

            const formattedMessage = JSON.stringify(messageData)
            await this.historyManager.appendMessage('user', formattedMessage)

            const history = this.historyManager.prepareHistory().map(msg => ({
                role: msg.role,
                content: msg.content || '',
            })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]

            const imageUrls = new Set<string>()
            if (options.imageAttachments?.length) {
                options.imageAttachments.forEach(url => imageUrls.add(url))
            }

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
                history.push({ role: 'system', content: '[ Previous conversation context from this channel: ]' })
                history.push(...contextMessages)
                history.push({ role: 'system', content: '[ End of context. Current message: ]' })
            }

            const messageForCompletion = await this.parseMessagesForChatCompletion(
                formattedMessage,
                Array.from(imageUrls)
            )
            history.push(messageForCompletion as OpenAI.Chat.Completions.ChatCompletionMessageParam)

            let aiResponse = await this.generateAIResponse(history) // aiResponse is Zod object
            if (!aiResponse) return []

            const processedResponse = this.convertToResponseArray(aiResponse)
            await this.historyManager.appendMessage('assistant', processedResponse)

            if (aiResponse.command && aiResponse.command.name !== 'noOp') {
                const commandIndicator = `-# ℹ️ Assistant command called: ${aiResponse.command.name}${aiResponse.command.params ? `(${aiResponse.command.params.join(', ')})` : ''}`
                if (originalMessage?.channel && 'send' in originalMessage.channel) {
                    await originalMessage.channel.send(commandIndicator)
                }

                const commandResult = await this.commandParser.parseCommand(
                    { ...aiResponse.command, params: aiResponse.command.params ?? undefined },
                    originalMessage
                )

                if (commandResult) {
                    const commandMessage = `Command executed: ${aiResponse.command.name}${aiResponse.command.params ? `(${aiResponse.command.params.join(', ')})` : ''}\\nResult: ${commandResult}`
                    history.push({ role: 'system', content: commandMessage })
                    await this.historyManager.appendMessage('system', commandMessage)

                    aiResponse = await this.generateAIResponse(history) // new Zod object
                    if (aiResponse) {
                        const followupResponse = this.convertToResponseArray(aiResponse)
                        await this.historyManager.appendMessage('assistant', followupResponse)
                        return followupResponse
                    }
                }
            }

            return processedResponse

        } catch (e) {
            const error = e as Error
            logger.warn(`Error processing AI response: ${red(error.message)}`)
            logger.debug(error.stack ?? 'No stack trace')
            throw error
        }
    }

    private async generateAIResponse(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
        const RESPONSE_TIMEOUT_MS = 30000

        try {
            const responsePromise = this.openai.chat.completions.create({
                messages,
                model: OPENAI_MODEL,
                response_format: zodResponseFormat(CRIMSONCHAT_RESPONSE_SCHEMA, 'response')
            })

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Response timeout: Assistant took too long to respond')), RESPONSE_TIMEOUT_MS)
            })

            const response = await Promise.race([responsePromise, timeoutPromise]) as OpenAI.Chat.Completions.ChatCompletion
            if (!response.choices[0].message.content) {
                throw new Error('No response from OpenAI')
            }

            const parsedResponse = CRIMSONCHAT_RESPONSE_SCHEMA.parse(response.choices[0].message.content)
            return parsedResponse
        } catch (error) {
            if (error instanceof Error && error.message.includes('Response timeout')) {
                logger.error(`${red(error.message)}`)
                throw error
            }
            throw error
        }
    }

    private async handleRandomBreakdown(userContent: string, options: UserMessageOptions): Promise<ChatResponseArray | null> {
        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${yellow(this.forceNextBreakdown ? 'forced' : 'random')} Crimson 1 breakdown`)
            this.forceNextBreakdown = false

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

            const breakdownZod = await this.generateAIResponse([{
                role: 'system',
                content: CRIMSON_BREAKDOWN_PROMPT
            }])

            if (breakdownZod) {
                const responseArray = this.convertToResponseArray(breakdownZod)
                await this.historyManager.appendMessage('assistant', responseArray)
                return responseArray
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
            logger.error(`Error fetching user status: ${red(error.message)}`)
            return 'unknown'
        }
    }

    private convertToResponseArray(aiZodOutput: z.infer<typeof CRIMSONCHAT_RESPONSE_SCHEMA> | null | undefined): ChatResponseArray {
        const result: ChatResponseArray = []
        if (!aiZodOutput) return result

        if (aiZodOutput.replyMessages) {
             // Check for nested stringified JSON and unwrap if necessary
            for (const msgContent of aiZodOutput.replyMessages) {
                try {
                    const parsed = JSON.parse(msgContent)
                    const nestedSchemaCheck = CRIMSONCHAT_RESPONSE_SCHEMA.safeParse(parsed)
                    if (nestedSchemaCheck.success) {
                        const unwrappedData = nestedSchemaCheck.data
                        if (unwrappedData.replyMessages) {
                            result.push(...unwrappedData.replyMessages)
                        }
                        if (unwrappedData.embed) {
                            result.push({
                                embed: {
                                    ...unwrappedData.embed,
                                    author: unwrappedData.embed.author === null ? undefined : unwrappedData.embed.author,
                                    color: unwrappedData.embed.color ?? 0x8B0000,
                                    footer: unwrappedData.embed.footer ? String(unwrappedData.embed.footer) : undefined,
                                    fields: unwrappedData.embed.fields?.map(f => ({ name: f.name, value: f.value })) ?? undefined
                                },
                            })
                        }
                    } else {
                        result.push(msgContent)
                    }
                } catch {
                    result.push(msgContent)
                }
            }
        }
        if (aiZodOutput.embed) {
            result.push({
                embed: {
                    ...aiZodOutput.embed,
                    author: aiZodOutput.embed.author === null ? undefined : aiZodOutput.embed.author,
                    color: aiZodOutput.embed.color ?? 0x8B0000,
                    footer: aiZodOutput.embed.footer ? String(aiZodOutput.embed.footer) : undefined,
                    fields: aiZodOutput.embed.fields?.map(f => ({ name: f.name, value: f.value })) ?? undefined
                },
            })
        }
        if (aiZodOutput.command) {
            result.push({ command: { name: aiZodOutput.command.name, params: aiZodOutput.command.params || [] } })
        }
        return result
    }

    private formatResponseForContext(response: ChatResponseArray): string {
        return response.map(item => {
            if (typeof item === 'string') return item
            if ('embed' in item) {
                return `[Embed: ${item.embed.title || ''}\\n${item.embed.description || ''}]`
            }
            if ('command' in item) {
                return `[Command: ${item.command.name}${item.command.params ? `(${item.command.params.join(', ')})` : ''}]`
            }
            return ''
        }).filter(Boolean).join('\\n')
    }
}
