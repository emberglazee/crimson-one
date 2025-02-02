import { Client, Message } from 'discord.js'
import OpenAI from 'openai'
import { ImageProcessor } from './ImageProcessor'
import { CommandParser } from './CommandParser'
import { formatUserMessage } from './utils/formatters'
import { Logger } from '../../util/logger'
import { CRIMSON_BREAKDOWN_PROMPT } from '../../util/constants'
import type { UserMessageOptions } from '../../types/types'

const logger = new Logger('MessageProcessor')

export class MessageProcessor {
    private client: Client | null = null
    private openai: OpenAI
    private imageProcessor: ImageProcessor
    private commandParser: CommandParser
    private forceNextBreakdown: boolean = false
    private readonly BREAKDOWN_CHANCE = 0.01

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        })
        this.imageProcessor = new ImageProcessor()
        this.commandParser = new CommandParser()
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
            options.username,
            options.displayName,
            options.serverDisplayName,
            content,
            options.respondingTo
        )

        const messageForCompletion = await this.parseMessagesForChatCompletion(
            formattedMessage, 
            Array.from(imageUrls)
        )

        let response = await this.openai.chat.completions.create({
            messages: [messageForCompletion],
            model: 'gpt-4o-mini'
        })

        const { content: parsedResponse, hadCommands } = await this.parseAssistantReply(response.choices[0].message)
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

    private async parseMessagesForChatCompletion(content: string, attachments: string[] = []): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
        if (!attachments.length) {
            return { role: 'user', content }
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
}
