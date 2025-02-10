// ChatGPT agent to manage long-term memory for CrimsonChat

import chalk from 'chalk'
import { Logger } from '../../util/logger'
import OpenAI from 'openai'
import type CrimsonChat from '.'

const logger = new Logger('CrimsonChat | MemoryManager')

export class MemoryManager {
    private static instance: MemoryManager
    private crimsonChat?: CrimsonChat
    private openai: OpenAI

    public static getInstance(): MemoryManager {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager()
        }
        return MemoryManager.instance
    }

    public setCrimsonChat(crimsonChat: CrimsonChat): void {
        this.crimsonChat = crimsonChat
    }

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY!
        })
    }

    public async process(message: string): Promise<string> {
        if (!this.crimsonChat) {
            throw new Error('CrimsonChat instance not set. Use \`memoryManager.setCrimsonChat()\`')
        }
        try {
            const response = await this.openai.chat.completions.create({
                messages: [{ role: 'system', content: message }],
                model: 'gpt-4o-mini'
            })
            return response.choices[0].message.content ?? ''
        } catch (e) {
            const error = e as Error
            logger.error(`Error processing message: ${chalk.red(error.message)}`)
            return 'I am having trouble remembering things right now. Please try again later.'
        }
    }
}
