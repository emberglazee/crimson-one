import chalk from 'chalk'
import { Logger } from '../../util/logger'
import OpenAI from 'openai'
import { CRIMSON_LONG_TERM_MEMORY_PROMPT, OPENAI_BASE_URL, OPENAI_MODEL } from '../../util/constants'
import type { Memory } from '../../types/types'
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
        } catch (error) {
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
        content: string, 
        context?: string
    ): Promise<void> {
        // Add to queue and process if not already processing
        this.memoryQueue.push({ content, context })
        this.processNextMemory()
    }

    private async processNextMemory(): Promise<void> {
        if (this.isProcessingMemory || this.memoryQueue.length === 0) {
            return
        }

        this.isProcessingMemory = true
        const { content, context } = this.memoryQueue.shift()!

        try {
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
Assistant's response: "${content}"`
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
                return
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
                        evaluation: response, // Store the AI's reasoning
                        timestamp: Date.now(),
                        importance
                    })
                    logger.info(`Stored memory with importance ${chalk.yellow(importance)}: ${chalk.cyan(content.substring(0, 50))}...`)
                }
            }
        } catch (error) {
            logger.error(`Memory evaluation error:\n${chalk.red(error instanceof Error ? error.stack : error)}`)
        } finally {
            this.isProcessingMemory = false
            // Process next memory if any
            if (this.memoryQueue.length > 0) {
                setTimeout(() => this.processNextMemory(), 100) // Small delay to prevent CPU hogging
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