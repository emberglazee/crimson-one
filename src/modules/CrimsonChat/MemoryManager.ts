import chalk from 'chalk'
import { Logger } from '../../util/logger'
import OpenAI from 'openai'
import { CRIMSON_LONG_TERM_MEMORY_PROMPT } from '../../util/constants'
import type { Memory } from '../../types/types'

const logger = new Logger('CrimsonChat | MemoryManager')

export class MemoryManager {
    private static instance: MemoryManager
    private openai: OpenAI
    private memories: Memory[] = []
    
    public static getInstance(): MemoryManager {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager()
        }
        return MemoryManager.instance
    }

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY!
        })
    }

    public async evaluateAndStore(
        content: string, 
        context?: string
    ): Promise<{ stored: boolean; response: string }> {
        try {
            const evaluation = await this.openai.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: CRIMSON_LONG_TERM_MEMORY_PROMPT
                    },
                    {
                        role: 'user',
                        content: `Evaluate this information for storage: "${content}"`
                    }
                ],
                model: 'gpt-4o-mini',
                temperature: 0.7
            })

            const response = evaluation.choices[0].message.content ?? ''

            if (response.toLowerCase().includes('important') || 
                response.toLowerCase().includes('remember')) {
                const importance = this.calculateImportance(response)

                await this.storeMemory({
                    content,
                    context,
                    timestamp: Date.now(),
                    importance
                })

                return { stored: true, response }
            }

            return { stored: false, response }
        } catch (error) {
            logger.error(`Memory evaluation error:\n${chalk.red(error instanceof Error ? error.stack : error)}`)
            throw error
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
                model: 'gpt-4-turbo-preview'
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
        this.memories.push(memory)
        this.memories.sort((a, b) => b.importance - a.importance)
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
}