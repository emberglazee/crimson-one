import chalk from 'chalk'
import { Logger } from '../../util/logger'
import OpenAI from 'openai'
import { CRIMSON_LONG_TERM_MEMORY_PROMPT, OPENAI_BASE_URL, OPENAI_MODEL } from '../../util/constants'
import type { Memory, ChatResponse, ChatResponseArray } from '../../types/types'
import { promises as fs } from 'fs'
import path from 'path'

const logger = new Logger('CrimsonChat | MemoryManager')

export class MemoryManager {
    private static instance: MemoryManager
    private openai: OpenAI
    private memories: Memory[] = []
    private memoryPath = path.join(process.cwd(), 'data/memories.json')
    private memoryQueue: { content: string, context?: string }[] = []
    private isProcessingMemory = false

    public static getInstance(): MemoryManager {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager()
        }
        return MemoryManager.instance
    }

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY!,
            baseURL: OPENAI_BASE_URL
        })
    }

    async init(): Promise<void> {
        await this.loadMemories()
    }

    private async loadMemories(): Promise<void> {
        try {
            const data = await fs.readFile(this.memoryPath, 'utf-8')
            const allMemories = JSON.parse(data)

            // Filter out memories that were marked as "don't store"
            this.memories = allMemories.filter((memory: Memory) =>
                !memory.evaluation?.toLowerCase().includes("don't store") &&
                !memory.evaluation?.toLowerCase().includes("do not store")
            )

            if (allMemories.length !== this.memories.length) {
                logger.info(`Filtered out ${chalk.yellow(allMemories.length - this.memories.length)} invalid memories during load`)
                await this.saveMemories() // Save the cleaned memories
            }

            logger.info(`Memories loaded successfully with ${chalk.yellow(this.memories.length)} entries`)
        } catch {
            this.memories = []
            logger.warn('No existing memories found, starting fresh')
        }
    }

    private async saveMemories(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.memoryPath), { recursive: true })
            await fs.writeFile(this.memoryPath, JSON.stringify(this.memories, null, 2))
            logger.info('Memories saved successfully')
        } catch (e) {
            const error = e as Error
            logger.error(`Failed to save memories: ${chalk.red(error.message)}`)
        }
    }

    public async evaluateAndStore(
        content: string | ChatResponse | ChatResponseArray,
        context?: string
    ): Promise<void> {
        // Convert content to string if it's not already
        let contentString: string
        if (typeof content === 'string') {
            contentString = content
        } else if (Array.isArray(content)) {
            contentString = content
                .map(item => {
                    if (typeof item === 'string') return item
                    if ('embed' in item) {
                        return `[Embed: ${item.embed.title || ''}\n${item.embed.description || ''}]`
                    }
                    if ('command' in item) {
                        return `[Command: ${item.command.name}${item.command.params ? `(${item.command.params.join(', ')})` : ''}]`
                    }
                    return ''
                })
                .filter(Boolean)
                .join('\n')
        } else {
            contentString = 'embed' in content
                ? `[Embed: ${content.embed?.title || ''}\n${content.embed?.description || ''}]`
                : JSON.stringify(content)
        }

        // Add to queue and process if not already processing
        this.memoryQueue.push({ content: contentString, context })
        this.processNextMemory()
    }

    private async processNextMemory(): Promise<void> {
        if (this.isProcessingMemory || this.memoryQueue.length === 0) {
            return
        }

        this.isProcessingMemory = true

        try {
            // Batch process all items in the queue
            while (this.memoryQueue.length > 0) {
                const { content, context } = this.memoryQueue.shift()!

                const evaluation = await this.openai.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: CRIMSON_LONG_TERM_MEMORY_PROMPT
                        },
                        {
                            role: 'user',
                            content: `Evaluate this information for storage.
Context of conversation: "${context || 'No context provided'}"
Content: "${content}"`
                        }
                    ],
                    model: OPENAI_MODEL,
                    temperature: 1
                })

                const response = evaluation.choices[0].message.content ?? ''

                // Don't store if evaluation explicitly says not to
                if (response.toLowerCase().includes('don\'t store') ||
                    response.toLowerCase().includes('do not store')) {
                    logger.info('Skipping memory storage based on evaluation')
                    continue
                }

                const hasImportanceKeyword = response.toLowerCase().includes('important') ||
                    response.toLowerCase().includes('remember') ||
                    response.toLowerCase().includes('critical') ||
                    response.toLowerCase().includes('useful') ||
                    response.toLowerCase().includes('relevant')

                if (hasImportanceKeyword) {
                    const importance = this.calculateImportance(response)

                    // Only store if importance is above BASIC (1)
                    if (importance > 1) {
                        await this.storeMemory({
                            content,
                            context,
                            evaluation: response,
                            timestamp: Date.now(),
                            importance
                        })
                        logger.info(`Stored memory with importance ${chalk.yellow(importance)}: ${chalk.cyan(content.substring(0, 50))}...`)
                    }
                }

                // Add a small delay between evaluations to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        } catch (error) {
            logger.error(`Memory evaluation error:\n${chalk.red(error instanceof Error ? error.stack : error)}`)
        } finally {
            this.isProcessingMemory = false
            // Check if new items were added to queue during processing
            if (this.memoryQueue.length > 0) {
                setTimeout(() => this.processNextMemory(), 100)
            }
        }
    }

    public async retrieveRelevantMemories(context: string): Promise<Memory[]> {
        try {
            const prompt = `Given this context: "${context}", find the most relevant memories from this list:\n${this.memories.map(m => m.content).join('\n')}`

            const response = await this.openai.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Return only the numbers of relevant memories, comma-separated.' },
                    { role: 'user', content: prompt }
                ],
                model: OPENAI_MODEL
            })

            const relevantIndices = (response.choices[0].message.content ?? '')
                .split(',')
                .map(i => parseInt(i.trim()))
                .filter(i => !isNaN(i) && i < this.memories.length)

            return relevantIndices.map(i => this.memories[i])
        } catch (error) {
            logger.error(`Memory retrieval error:\n${chalk.red(error instanceof Error ? error.stack : error)}`)
            return []
        }
    }

    private async storeMemory(memory: Memory): Promise<void> {
        // Check for duplicate or very similar memories
        const isDuplicate = this.memories.some(m =>
            m.content === memory.content ||
            (m.content.length > 10 && memory.content.includes(m.content)) ||
            (memory.content.length > 10 && m.content.includes(memory.content))
        )

        if (!isDuplicate) {
            this.memories.push(memory)
            // Keep only the top 1000 most important memories
            this.memories.sort((a, b) => b.importance - a.importance)
            if (this.memories.length > 1000) {
                this.memories = this.memories.slice(0, 1000)
            }
            await this.saveMemories()
            logger.info(`Memory stored successfully. Total memories: ${chalk.yellow(this.memories.length)}`)
        } else {
            logger.info('Skipped storing duplicate memory')
        }
    }

    public async clearMemories(): Promise<void> {
        this.memories = []
        await this.saveMemories()
        logger.info('Memories cleared and saved')
    }

    private calculateImportance(aiResponse: string): 1 | 2 | 3 | 4 | 5 {
        const keywords = {
            critical: 5,
            important: 4,
            useful: 3,
            relevant: 2,
            basic: 1
        }

        let maxImportance = 1
        for (const [keyword, value] of Object.entries(keywords)) {
            if (aiResponse.toLowerCase().includes(keyword)) {
                maxImportance = Math.max(maxImportance, value)
            }
        }

        return maxImportance as 1 | 2 | 3 | 4 | 5
    }

    public getQueueLength(): number {
        return this.memoryQueue.length
    }
}
