import { promises as fs } from 'fs'
import path from 'path'
import { Logger } from '../../util/logger'
import { CRIMSON_CHAT_SYSTEM_PROMPT } from '../../util/constants'
import type { ChatMessage } from '../../types/types'
import { encoding_for_model } from 'tiktoken'

const logger = new Logger('HistoryManager')

export class HistoryManager {
    private static instance: HistoryManager
    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private history: ChatMessage[] = []

    public static getInstance(): HistoryManager {
        if (!HistoryManager.instance) {
            HistoryManager.instance = new HistoryManager()
        }
        return HistoryManager.instance
    }

    public static forceClearInstance(): void {
        HistoryManager.instance = undefined as any;
    }

    async init(): Promise<void> {
        await this.loadHistory()
    }

    public get tokenCount(): number {
        const enc = encoding_for_model('gpt-4o-mini')
        const totalTokens = this.history.reduce((acc, curr) => {
            const tokens = enc.encode(typeof curr.content === 'string' ? curr.content : '')
            return acc + tokens.length
        }, 0)
        enc.free()
        return totalTokens
    }
    public get messageCount(): number {
        return this.history.length
    }

    async loadHistory(): Promise<void> {
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedHistory = JSON.parse(data)

            // Check if there's any history loaded
            if (savedHistory.length) {
                // If first message is not system prompt, prepend it
                if (savedHistory[0].role !== 'system') {
                    this.history = [{
                        role: 'system',
                        content: CRIMSON_CHAT_SYSTEM_PROMPT
                    }, ...savedHistory]
                } else {
                    // Use saved history as-is
                    this.history = savedHistory
                }
            } else {
                // Initialize with just system prompt if history is empty
                this.history = [{
                    role: 'system',
                    content: CRIMSON_CHAT_SYSTEM_PROMPT
                }]
            }

            logger.info(`Chat history loaded successfully with ${this.history.length} messages`)
        } catch (error) {
            // Only initialize with system prompt if file doesn't exist
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
        // Ensure system prompt exists at start of history
        if (this.history.length === 0 || this.history[0].role !== 'system') {
            this.history.unshift({
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            })
        }

        this.history.push({ role, content })
        await this.saveHistory()
        logger.info(`Appended ${role} message to history`)
    }

    async clearHistory(): Promise<void> {
        // Clear the singleton instance first
        HistoryManager.forceClearInstance();
        
        // Reset history array
        this.history = [{
            role: 'system',
            content: CRIMSON_CHAT_SYSTEM_PROMPT
        }]
        
        // Save empty history to file
        await this.saveHistory()
        
        // Reload history to ensure clean state
        await this.loadHistory()
        
        logger.info('Chat history cleared and instance reset')
    }

    async trimHistory(): Promise<void> {
        const originalLength = this.history.length
        let historyTokens = this.tokenCount

        // Never remove system prompt during trimming
        while (historyTokens > 128000 && this.history.length > 2) {
            // Start removing from index 1 to preserve system prompt
            this.history.splice(1, 1)
            historyTokens = this.tokenCount
        }

        if (originalLength !== this.history.length) {
            logger.info(`Trimmed history from ${originalLength} to ${this.history.length} messages`)
            await this.saveHistory()
        }
    }

    prepareHistory(): ChatMessage[] {
        // Ensure system prompt exists before preparing history
        if (this.history.length === 0 || this.history[0].role !== 'system') {
            this.history.unshift({
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            })
        }
        return this.history.map(({ role, content }) => ({ role, content: content || '' }))
    }

    async updateSystemPrompt(): Promise<void> {
        if (this.history[0].role === 'system') {
            this.history[0].content = CRIMSON_CHAT_SYSTEM_PROMPT
        } else {
            this.history.unshift({ role: 'system', content: CRIMSON_CHAT_SYSTEM_PROMPT })
        }
        await this.saveHistory()
        logger.info('System prompt updated to latest version')
    }
}
