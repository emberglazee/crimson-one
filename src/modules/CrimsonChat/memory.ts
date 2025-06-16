import { promises as fs } from 'fs'
import path from 'path'
import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage
} from '@langchain/core/messages'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import { Logger } from '../../util/logger'
import {
    getCrimsonChatHistoryFoundation,
    CRIMSON_CHAT_SYSTEM_PROMPT,
} from '../../util/constants'
import type { ChatMessage } from '../../types'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | History')

export class CrimsonFileBufferHistory extends BaseChatMessageHistory {
    // Required by LangChain's serializable classes
    lc_namespace = ['langchain', 'memory', 'chat_history']

    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private history: BaseMessage[] = []
    private initialized = false

    constructor() {
        super()
    }

    private chatMessageToBaseMessage(msg: ChatMessage): BaseMessage {
        switch (msg.role) {
            case 'user': {
                let content: BaseMessage['content'] = msg.content ?? ''
                // Try to parse content in case it's a stringified array (for multi-modal)
                if (typeof content === 'string' && content.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(content)
                        if (Array.isArray(parsed)) {
                            content = parsed
                        }
                    } catch {
                        // Not valid JSON, treat as plain text
                    }
                }
                return new HumanMessage({ content })
            }
            case 'assistant': {
                const aiMessage = new AIMessage({ content: msg.content ?? '' })
                // Reconstruct tool_calls if they exist
                if (msg.tool_calls) {
                    aiMessage.tool_calls = msg.tool_calls.map(tc => ({
                        id: tc.id,
                        name: tc.name,
                        args: tc.args,
                        type: 'tool_call',
                    }))
                }
                return aiMessage
            }
            case 'system':
                return new SystemMessage({ content: msg.content ?? '' })
            case 'tool':
                // Reconstruct ToolMessage if it exists
                return new ToolMessage({
                    content: msg.content ?? '',
                    tool_call_id: msg.tool_call_id!,
                })
            default:
                // Fallback for safety, though it shouldn't be reached
                return new HumanMessage({ content: msg.content ?? '' })
        }
    }

    private baseMessageToChatMessage(message: BaseMessage): ChatMessage {
        const messageType = message.getType()
        if (messageType === 'human') {
            const contentToStore = typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content)
            return { role: 'user', content: contentToStore }
        } else if (messageType === 'ai') {
            const aiMessage = message as AIMessage
            return {
                role: 'assistant',
                content: aiMessage.content.toString(),
                tool_calls: aiMessage.tool_calls?.map(tc => ({
                    id: tc.id!,
                    name: tc.name,
                    args: tc.args,
                    type: 'tool_call',
                })),
            }
        } else if (messageType === 'system') {
            return { role: 'system', content: message.content.toString() }
        } else if (messageType === 'tool') {
            const toolMessage = message as ToolMessage
            return {
                role: 'tool',
                content: toolMessage.content.toString(),
                tool_call_id: toolMessage.tool_call_id,
            }
        }
        // Fallback should not be reached
        return { role: 'user', content: JSON.stringify(message.content) }
    }

    private async loadHistoryFromFile(): Promise<void> {
        if (this.initialized) return
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedHistory: ChatMessage[] = JSON.parse(data)

            const historyToLoad = (savedHistory.length && savedHistory[0]?.role === 'system')
                ? savedHistory
                : getCrimsonChatHistoryFoundation()

            this.history = historyToLoad.map(this.chatMessageToBaseMessage)
            this.initialized = true
            logger.info(`Chat history loaded successfully with ${chalk.yellow(this.history.length)} messages`)
        } catch {
            this.history = getCrimsonChatHistoryFoundation().map(this.chatMessageToBaseMessage)
            logger.warn('No existing chat history found, starting fresh')
            this.initialized = true
        }
    }

    private async saveHistoryToFile(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })
            const historyToSave = this.history.map(this.baseMessageToChatMessage)
            await fs.writeFile(this.historyPath, JSON.stringify(historyToSave, null, 2))
        } catch (e) {
            logger.error(`Failed to save chat history: ${chalk.red((e as Error).message)}`)
        }
    }

    async getMessages(): Promise<BaseMessage[]> {
        await this.loadHistoryFromFile()
        return this.history
    }

    async addMessages(messages: BaseMessage[]): Promise<void> {
        await this.loadHistoryFromFile()
        this.history.push(...messages)
        await this.saveHistoryToFile()
    }

    async addMessage(message: BaseMessage): Promise<void> {
        await this.addMessages([message])
    }

    async addUserMessage(message: string): Promise<void> {
        await this.addMessages([new HumanMessage(message)])
    }
    async addAIChatMessage(message: string): Promise<void> {
        await this.addMessages([new AIMessage(message)])
    }

    async clear(systemPrompt: string = CRIMSON_CHAT_SYSTEM_PROMPT): Promise<void> {
        this.history = getCrimsonChatHistoryFoundation(systemPrompt).map(this.chatMessageToBaseMessage)
        await this.saveHistoryToFile()
        logger.ok('Chat history cleared and file reset.')
    }

    async updateSystemPrompt(newPrompt: string): Promise<void> {
        await this.loadHistoryFromFile()
        if (this.history[0]?.getType() === 'system') {
            this.history[0].content = newPrompt
        } else {
            this.history.unshift(new SystemMessage(newPrompt))
        }
        await this.saveHistoryToFile()
        logger.ok(`System prompt updated.`)
    }
}
