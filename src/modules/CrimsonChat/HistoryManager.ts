import { promises as fs } from 'fs'
import path from 'path'
import { Logger } from '../../util/logger'
import { CRIMSON_CHAT_SYSTEM_PROMPT } from '../../util/constants'
import type { ChatMessage, ChatResponse, ChatResponseArray } from '../../types/types'
import { encoding_for_model } from 'tiktoken'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | HistoryManager')

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
        HistoryManager.instance = undefined as unknown as HistoryManager
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

    private async loadHistory(): Promise<void> {
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

            logger.info(`Chat history loaded successfully with ${chalk.yellow(this.messageCount)} messages`)
        } catch {
            // Only initialize with system prompt if file doesn't exist
            this.history = [{
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            }]
            logger.warn('No existing chat history found, starting fresh')
        }
    }

    private async saveHistory(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })
            await fs.writeFile(this.historyPath, JSON.stringify(this.history, null, 2))
            logger.info('Chat history saved successfully')
        } catch (e) {
            const error = e as Error
            logger.error(`Failed to save chat history: ${chalk.red(error.message)}`)
        }
    }

    public async appendMessage(role: 'system' | 'assistant' | 'user', content: ChatResponse | ChatResponseArray): Promise<void> {
        // Ensure system prompt exists at start of history
        if (this.history.length === 0 || this.history[0].role !== 'system') {
            this.history.unshift({
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            })
        }

        // For assistant messages, ensure they're in the schema format
        if (role === 'assistant') {
            // Convert single response to array format if needed
            const responses = Array.isArray(content) ? content : [content]

            // Check if there's a command in the responses
            const commandResponse = responses.find(msg => typeof msg === 'object' && 'command' in msg)
            if (commandResponse) {
                // If there's a command, only store the command
                this.history.push({ role, content: JSON.stringify({ command: commandResponse.command }) })
            } else {
                // Otherwise store as structured response with messages and embed
                const structuredResponse = {
                    replyMessages: responses.filter(msg => typeof msg === 'string'),
                    embed: responses.find(msg => typeof msg === 'object' && 'embed' in msg)?.embed
                }
                this.history.push({ role, content: JSON.stringify(structuredResponse) })
            }
        } else {
            // For system and user messages, keep as is but ensure string format
            const finalContent = typeof content === 'object' ? JSON.stringify(content) : content
            this.history.push({ role, content: finalContent })
        }

        await this.saveHistory()
        logger.ok(`Appended ${chalk.yellow(role)} message to history`)
        console.log(chalk.cyan(typeof content === 'object' ? JSON.stringify(content, null, 2) : content))
    }

    public async clearHistory(): Promise<void> {
        this.history = [{
            role: 'system',
            content: CRIMSON_CHAT_SYSTEM_PROMPT
        }]
        await this.saveHistory()
        logger.ok('Chat history cleared and instance reset')
    }

    public async trimHistory(): Promise<void> {
        const originalLength = this.history.length
        let historyTokens = this.tokenCount

        while (historyTokens > 128000 && this.history.length > 2) {
            // Start removing from index 1 to preserve system prompt
            this.history.splice(1, 1)
            historyTokens = this.tokenCount
        }

        if (originalLength !== this.history.length) {
            logger.ok(`Trimmed history from ${chalk.yellow(originalLength)} to ${chalk.yellow(this.messageCount)} messages`)
            await this.saveHistory()
        }
    }

    public prepareHistory(): ChatMessage[] {
        // Special handling for assistant messages to maintain schema consistency
        return this.history.map(({ role, content }) => {
            if (role === 'assistant' && typeof content === 'string') {
                try {
                    // Parse stored JSON to maintain structure
                    const parsedContent = JSON.parse(content)
                    return { role, content: JSON.stringify(parsedContent) }
                } catch {
                    // Fallback for legacy messages
                    return { role, content: JSON.stringify({ replyMessages: [content], embed: null }) }
                }
            }
            return { role, content: typeof content === 'string' ? content : '' }
        })
    }

    async updateSystemPrompt(): Promise<void> {
        if (this.history[0].role === 'system') {
            this.history[0].content = CRIMSON_CHAT_SYSTEM_PROMPT
        } else {
            this.history.unshift({ role: 'system', content: CRIMSON_CHAT_SYSTEM_PROMPT })
        }
        await this.saveHistory()
        logger.ok(`System prompt updated to current ${chalk.yellow('CRIMSON_CHAT_SYSTEM_PROMPT')}`)
    }
}
