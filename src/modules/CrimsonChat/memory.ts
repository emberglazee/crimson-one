import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | History')

import { promises as fs } from 'fs'
import path from 'path'
import {
    getCrimsonChatHistoryFoundation,
    CRIMSON_CHAT_SYSTEM_PROMPT,
} from '../../util/constants'
import type { ChatMessage } from '../../types'
import { type Content, type Part, POSSIBLE_ROLES } from '@google/generative-ai'
import type { ArrayElement } from 'typeorm'

export class CrimsonFileBufferHistory {
    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private history: Content[] = []
    private initialized = false
    private systemPrompt: string = CRIMSON_CHAT_SYSTEM_PROMPT

    // New method to convert our ChatMessage format to Gemini's Content format
    private chatMessageToContent(msg: ChatMessage): Content | null {
        if (msg.role === 'tool') {
            return {
                role: 'function',
                parts: [{
                    functionResponse: {
                        name: msg.tool_call_id!,
                        response: {
                            name: msg.tool_call_id!,
                            content: msg.content,
                        },
                    },
                }],
            }
        }

        const parts: Part[] = []

        if (msg.content) {
            // Handle multimodal content (stringified JSON array)
            if (typeof msg.content === 'string' && msg.content.startsWith('[')) {
                try {
                    const parsedContent = JSON.parse(msg.content)
                    if (Array.isArray(parsedContent)) {
                        for (const item of parsedContent) {
                            if (item.type === 'text') {
                                parts.push({ text: item.text })
                            } else if (item.type === 'image_url' && item.image_url.url.startsWith('data:')) {
                                const [header, base64Data] = item.image_url.url.split(',')
                                const mimeType = header.match(/data:(.*);base64/)?.[1]
                                if (mimeType && base64Data) {
                                    parts.push({ inlineData: { mimeType, data: base64Data } })
                                }
                            }
                        }
                    }
                } catch {
                    // Not valid JSON, treat as plain text
                    parts.push({ text: msg.content })
                }
            } else {
                parts.push({ text: msg.content })
            }
        }

        if (msg.tool_calls) {
            for (const toolCall of msg.tool_calls) {
                parts.push({ functionCall: { name: toolCall.name, args: toolCall.args }})
            }
        }

        let role: ArrayElement<typeof POSSIBLE_ROLES> = 'user'
        if (msg.role === 'assistant') role = 'model'
        else if (msg.role === 'user') role = 'user'

        // System prompt is handled separately in the model configuration now.
        // We will store it in the class but not include it as a 'system' role message in the history array.
        if (msg.role === 'system') {
            this.systemPrompt = msg.content
            return null // Don't add to history array
        }

        return { role, parts }
    }

    // New method to convert Gemini's Content to our ChatMessage for storage
    private contentToChatMessage(content: Content): ChatMessage | null {
        if (content.role === 'function') {
            const part = content.parts[0]
            if (part.functionResponse) {
                const responseContent = (part.functionResponse.response as { content: string }).content
                return {
                    role: 'tool',
                    content: responseContent,
                    tool_call_id: part.functionResponse.name
                }
            }
            return null
        }

        const msg: ChatMessage = {
            role: content.role === 'model' ? 'assistant' : 'user',
            content: ''
        }

        // Handle multimodal content for storage
        const contentPartsForStorage: { type: string; text?: string; image_url?: { url: string } }[] = []
        let hasNonTextContent = false

        for(const part of content.parts) {
            if('text' in part) {
                contentPartsForStorage.push({type: 'text', text: part.text})
            } else if (part.inlineData) {
                hasNonTextContent = true
                const { mimeType, data } = part.inlineData
                contentPartsForStorage.push({type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` }})
            } else if (part.functionCall) {
                hasNonTextContent = true
                if (!msg.tool_calls) msg.tool_calls = []
                msg.tool_calls.push({
                    name: part.functionCall.name,
                    args: part.functionCall.args,
                    type: 'tool_call',
                    id: `call_${Date.now()}` // Gemini doesn't provide IDs back, so we'll have to manage
                })
            }
        }

        // Stringify if multimodal or only one part is text
        if(hasNonTextContent && contentPartsForStorage.length > 0) {
            msg.content = JSON.stringify(contentPartsForStorage)
        } else if (contentPartsForStorage.length > 0) {
            msg.content = contentPartsForStorage[0].text!
        }

        // Don't save empty model responses that only contained a tool call
        if(msg.role === 'assistant' && !msg.content && msg.tool_calls?.length) {
            // we'll just store the tool call
        } else if (!msg.content && !msg.tool_calls) {
            return null // Don't save empty messages
        }

        return msg
    }

    private async loadHistoryFromFile(): Promise<void> {
        if (this.initialized) return
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedHistory: ChatMessage[] = JSON.parse(data)

            const historyToLoad = (savedHistory.length > 0)
                ? savedHistory
                : getCrimsonChatHistoryFoundation()

            this.history = historyToLoad
                .map(msg => this.chatMessageToContent(msg))
                .filter((c): c is Content => c !== null) // filter out system prompt

            // Extract the system prompt if it exists
            const systemMsg = historyToLoad.find(msg => msg.role === 'system')
            if (systemMsg) {
                this.systemPrompt = systemMsg.content
            }

            this.initialized = true
            logger.info(`Chat history loaded successfully with ${yellow(this.history.length)} messages`)
        } catch(e) {
            logger.warn(`No existing chat history found, starting fresh. Error: ${e}`)
            this.history = getCrimsonChatHistoryFoundation()
                .map(msg => this.chatMessageToContent(msg))
                .filter((c): c is Content => c !== null)

            const systemMsg = getCrimsonChatHistoryFoundation().find(msg => msg.role === 'system')
            this.systemPrompt = systemMsg ? systemMsg.content : CRIMSON_CHAT_SYSTEM_PROMPT

            this.initialized = true
        }
    }

    private async saveHistoryToFile(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })

            // Re-add system prompt for saving
            const systemChatMessage: ChatMessage = { role: 'system', content: this.systemPrompt }
            const historyToSave = [
                systemChatMessage,
                ...this.history.map(this.contentToChatMessage).filter((m): m is ChatMessage => m !== null)
            ]

            await fs.writeFile(this.historyPath, JSON.stringify(historyToSave, null, 2))
        } catch (e) {
            logger.error(`Failed to save chat history: ${red((e as Error).message)}`)
        }
    }

    async getHistory(): Promise<{history: Content[], systemInstruction: string}> {
        await this.loadHistoryFromFile()
        return {
            history: this.history,
            systemInstruction: this.systemPrompt
        }
    }

    async addMessages(messages: Content[]): Promise<void> {
        await this.loadHistoryFromFile()
        this.history.push(...messages)
        await this.saveHistoryToFile()
    }

    async clear(systemPrompt: string = CRIMSON_CHAT_SYSTEM_PROMPT): Promise<void> {
        this.systemPrompt = systemPrompt
        this.history = getCrimsonChatHistoryFoundation(systemPrompt)
            .map(msg => this.chatMessageToContent(msg))
            .filter((c): c is Content => c !== null)

        await this.saveHistoryToFile()
        logger.ok('Chat history cleared and file reset.')
    }

    async updateSystemPrompt(newPrompt: string): Promise<void> {
        await this.loadHistoryFromFile()
        this.systemPrompt = newPrompt
        await this.saveHistoryToFile()
        logger.ok(`System prompt updated.`)
    }
}
