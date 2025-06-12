// src/modules/CrimsonChat/memory.ts

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
    CRIMSON_CHAT_HISTORY_FOUNDATION,
    CRIMSON_CHAT_SYSTEM_PROMPT,
} from '../../util/constants'
import type { ChatMessage } from '../../types/types'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | History')

export class CrimsonFileBufferHistory extends BaseChatMessageHistory {
    // Required by LangChain's serializable classes
    lc_namespace = ['langchain', 'memory', 'chat_history']

    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private history: ChatMessage[] = []
    private initialized = false

    constructor() {
        super()
    }

    private async loadHistoryFromFile(): Promise<void> {
        if (this.initialized) return
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedHistory = JSON.parse(data)

            if (savedHistory.length && savedHistory[0].role === 'system') {
                this.history = savedHistory
            } else {
                this.history = [...CRIMSON_CHAT_HISTORY_FOUNDATION]
            }
            this.initialized = true
            logger.info(`Chat history loaded successfully with ${chalk.yellow(this.history.length)} messages`)
        } catch {
            this.history = [...CRIMSON_CHAT_HISTORY_FOUNDATION]
            logger.warn('No existing chat history found, starting fresh')
        }
    }

    private async saveHistoryToFile(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })
            await fs.writeFile(this.historyPath, JSON.stringify(this.history, null, 2))
        } catch (e) {
            logger.error(`Failed to save chat history: ${chalk.red((e as Error).message)}`)
        }
    }

    async getMessages(): Promise<BaseMessage[]> {
        await this.loadHistoryFromFile()
        return this.history.map(msg => {
            switch (msg.role) {
                case 'user':
                    return new HumanMessage({ content: msg.content ?? '' })
                case 'assistant':
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
        })
    }

    // Required abstract methods
    async addUserMessage(message: string): Promise<void> {
        await this.addMessages([new HumanMessage(message)])
    }
    async addAIChatMessage(message: string): Promise<void> {
        await this.addMessages([new AIMessage(message)])
    }

    // This is the required abstract method. We can just have it call addMessages.
    async addMessage(message: BaseMessage): Promise<void> {
        await this.addMessages([message])
    }

    // This is not an abstract method but is useful for the internal logic.
    async addMessages(messages: BaseMessage[]): Promise<void> {
        for (const message of messages) {
            const messageType = message.getType()
            if (messageType === 'human') {
                this.history.push({ role: 'user', content: message.content.toString() })
            } else if (messageType === 'ai') {
                const aiMessage = message as AIMessage
                this.history.push({
                    role: 'assistant',
                    content: aiMessage.content.toString(),
                    // Save the tool_calls property if it exists
                    tool_calls: aiMessage.tool_calls?.map(tc => ({
                        id: tc.id!,
                        name: tc.name,
                        args: tc.args,
                    })),
                })
            } else if (messageType === 'system') {
                this.history.push({ role: 'system', content: message.content.toString() })
            } else if (messageType === 'tool') {
                const toolMessage = message as ToolMessage
                // Handle and save ToolMessages
                this.history.push({
                    role: 'tool',
                    content: toolMessage.content.toString(),
                    tool_call_id: toolMessage.tool_call_id,
                })
            }
        }
        await this.saveHistoryToFile()
    }

    async clear(): Promise<void> {
        this.history = [...CRIMSON_CHAT_HISTORY_FOUNDATION]
        await this.saveHistoryToFile()
        logger.ok('Chat history cleared and file reset.')
    }

    async updateSystemPrompt(): Promise<void> {
        await this.loadHistoryFromFile()
        if (this.history[0]?.role === 'system') {
            this.history[0].content = CRIMSON_CHAT_SYSTEM_PROMPT
        } else {
            this.history.unshift({ role: 'system', content: CRIMSON_CHAT_SYSTEM_PROMPT })
        }
        await this.saveHistoryToFile()
        logger.ok(`System prompt updated to current version.`)
    }
}
