// src/modules/CrimsonChat/memory.ts

import { promises as fs } from 'fs'
import path from 'path'
import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
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
        // The constructor for BaseChatMessageHistory doesn't take arguments anymore.
        // We pass a dummy session ID internally if needed, but it's not used in our global history.
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
            if (msg.role === 'user') {
                return new HumanMessage({ content: msg.content ?? '' })
            } else if (msg.role === 'assistant') {
                return new AIMessage({ content: msg.content ?? '' })
            } else {
                return new SystemMessage({ content: msg.content ?? '' })
            }
        })
    }

    // Implement the required abstract methods
    async addUserMessage(message: string): Promise<void> {
        this.history.push({ role: 'user', content: message })
        await this.saveHistoryToFile()
    }

    async addAIChatMessage(message: string): Promise<void> {
        this.history.push({ role: 'assistant', content: message })
        await this.saveHistoryToFile()
    }

    async addMessage(message: BaseMessage): Promise<void> {
        // This is the required abstract method. We can just have it call addMessages.
        await this.addMessages([message])
    }

    // This is not an abstract method but is useful for our internal logic.
    async addMessages(messages: BaseMessage[]): Promise<void> {
        for (const message of messages) {
            if (message._getType() === 'human') {
                this.history.push({ role: 'user', content: message.content.toString() })
            } else if (message._getType() === 'ai') {
                this.history.push({ role: 'assistant', content: message.content.toString() })
            } else if (message._getType() === 'system') {
                 // It's generally better to manage the system prompt via `updateSystemPrompt`.
                 // But we can handle it here if needed.
                this.history.push({ role: 'system', content: message.content.toString() })
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
