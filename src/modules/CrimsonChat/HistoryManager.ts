import { promises as fs } from 'fs'
import path from 'path'
import { Logger } from '../../util/logger'
import { CRIMSON_CHAT_SYSTEM_PROMPT } from '../../util/constants'
import type { ChatMessage } from '../../types/types'

const logger = new Logger('HistoryManager')

export class HistoryManager {
    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private history: ChatMessage[] = []

    async init(): Promise<void> {
        await this.loadHistory()
    }

    async loadHistory(): Promise<void> {
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedHistory = JSON.parse(data)
            this.history = [{
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            }]
            this.history.push(...savedHistory.filter((msg: any) => msg.role !== 'system'))
            logger.info('Chat history loaded successfully')
        } catch (error) {
            this.history = [{
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            }]
            logger.warn('No existing chat history found, starting fresh')
        }
    }

    async saveHistory(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })
            await fs.writeFile(this.historyPath, JSON.stringify(this.history, null, 2))
            logger.info('Chat history saved successfully')
        } catch (e) {
            const error = e as Error
            logger.error(`Failed to save chat history: ${error.message}`)
        }
    }

    async appendMessage(role: 'system' | 'assistant' | 'user', content: string): Promise<void> {
        this.history.push({ role, content })
        await this.saveHistory()
        logger.info(`Appended ${role} message to history`)
    }

    async clearHistory(): Promise<void> {
        this.history = [{
            role: 'system',
            content: CRIMSON_CHAT_SYSTEM_PROMPT
        }]
        await this.saveHistory()
        logger.info('Chat history cleared')
    }

    async trimHistory(): Promise<void> {
        const originalLength = this.history.length
        let historyTokens = this.history.reduce((acc, curr) => acc + (curr.content || '').split(' ').length, 0)

        while (historyTokens > 128000 && this.history.length > 2) {
            this.history.splice(1, 1)
            historyTokens = this.history.reduce((acc, curr) => acc + (curr.content || '').split(' ').length, 0)
        }

        if (originalLength !== this.history.length) {
            logger.info(`Trimmed history from ${originalLength} to ${this.history.length} messages`)
            await this.saveHistory()
        }
    }

    prepareHistory(): ChatMessage[] {
        return this.history.map(({ role, content }) => ({ role, content: content || '' }))
    }
}
