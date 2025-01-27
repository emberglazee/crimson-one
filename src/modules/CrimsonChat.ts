// module for crimson chat - chatgpt talks with the personality of Crimson 1
import type { Client, TextChannel } from 'discord.js'
import OpenAI from 'openai'
import { CRIMSON_CHAT_SYSTEM_PROMPT } from '../util/constants'
import type { ChatCompletionMessage } from 'openai/resources/index.mjs'
import { promises as fs } from 'fs'
import path from 'path'
import { Logger } from '../util/logger'
const logger = new Logger('CrimsonChat')

export default class CrimsonChat {
    private static instance: CrimsonChat
    private openai: OpenAI
    private threadId = '1333319963737325570'
    private thread: TextChannel | null = null
    private client: Client | null = null
    private historyPath = path.join(process.cwd(), 'data', 'chat_history.json')
    private isProcessing: boolean = false
    private enabled: boolean = true
    history: { role: 'system' | 'assistant' | 'user', content?: string }[] = [{
        role: 'system',
        content: CRIMSON_CHAT_SYSTEM_PROMPT
    }]

    // Constructor & Static Methods
    private constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        })
    }
    public static getInstance(): CrimsonChat {
        if (!CrimsonChat.instance) {
            CrimsonChat.instance = new CrimsonChat()
        }
        return CrimsonChat.instance
    }

    // Initialization Methods
    public setClient(client: Client) {
        this.client = client
    }

    private async loadHistory(): Promise<void> {
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedHistory = JSON.parse(data)
            // Always ensure system prompt is first
            this.history = [{
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            }]
            // Add saved messages after system prompt
            this.history.push(...savedHistory.filter((msg: any) => msg.role !== 'system'))
        } catch (error) {
            // If file doesn't exist or is invalid, start with just the system prompt
            this.history = [{
                role: 'system',
                content: CRIMSON_CHAT_SYSTEM_PROMPT
            }]
        }
    }

    private async saveHistory(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })
            await fs.writeFile(this.historyPath, JSON.stringify(this.history, null, 2))
        } catch (error) {
            console.error('Failed to save chat history:', error)
        }
    }

    public async init(): Promise<void> {
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        this.thread = await this.client.channels.fetch(this.threadId) as TextChannel
        if (!this.thread) {
            throw new Error('Could not find webhook thread')
        }
        
        await this.loadHistory()
    }

    // Toggle Methods
    public isEnabled(): boolean {
        return this.enabled
    }

    public setEnabled(state: boolean): void {
        this.enabled = state
        logger.info(`CrimsonChat ${state ? 'enabled' : 'disabled'}`)
    }

    // Message Processing Methods
    public async sendMessage(content: string, options: {
        username: string,
        displayName: string,
        serverDisplayName: string,
        respondingTo?: { targetUsername: string; targetText: string }
    }, originalMessage?: any) {
        if (!this.thread) throw new Error('Thread not set. Call init() first.')

        // If chat is disabled, silently ignore the message
        if (!this.enabled) return

        // If already processing a message, react with X and return
        if (this.isProcessing && originalMessage) {
            await originalMessage.react('❌')
            return
        }

        this.isProcessing = true

        try {
            const formattedMessage = await this.formatUserMessage(
                options.username,
                options.displayName,
                options.serverDisplayName,
                content,
                options.respondingTo
            )

            this.appendMessage('user', formattedMessage)
            this.trimHistory()

            let hasMoreCommands = true

            while (hasMoreCommands) {
                const response = await this.openai.chat.completions.create({
                    messages: this.prepareHistory(),
                    model: 'gpt-4o-mini'
                })

                const message = response.choices[0].message
                const { content: parsedResponse, hadCommands } = await this.parseAssistantReply(message)

                if (parsedResponse === null) {
                    // ignore() was called
                    this.isProcessing = false
                    return
                }

                // Always keep the original message in history
                this.appendMessage('assistant', message.content || '')

                if (!hadCommands) {
                    // No more commands to process, send the final message
                    await this.sendResponseToDiscord(parsedResponse)
                    hasMoreCommands = false
                } else {
                    // There were commands, append their responses and continue the chain
                    this.appendMessage('system', parsedResponse)
                }
            }
        } finally {
            this.isProcessing = false
        }
    }

    private async parseAssistantReply(message: ChatCompletionMessage): Promise<{ content: string | null; hadCommands: boolean }> {
        const content = message.content
        if (!content) return { content: null, hadCommands: false }

        // Look for commands in the message
        const commandRegex = /!(fetchRoles|fetchUser|getRichPresence|ignore)\([^)]*\)/g
        const commands = content.match(commandRegex)

        if (!commands) return { content, hadCommands: false }

        // Process each command and replace it in the message
        let modifiedContent = content
        for (const command of commands) {
            const response = await this.parseCommand(command)
            if (response === null) return { content: null, hadCommands: true } // ignore() was called
            modifiedContent = modifiedContent.replace(command, `${command} -> ${response}`)
        }

        return { content: modifiedContent, hadCommands: true }
    }

    private async sendResponseToDiscord(content: string): Promise<void> {
        if (!this.thread) throw new Error('Thread not set')
        
        // If content is over 2000 characters, send as a file
        if (content.length > 2000) {
            const buffer = Buffer.from(content, 'utf-8')
            await this.thread.send({
                files: [{
                    attachment: buffer,
                    name: 'response.txt'
                }]
            })
        } else {
            await this.thread.send(content)
        }
    }

    private async parseCommand(text: string): Promise<string | null> {
        // Command regex with argument capture
        const commandRegex = /!(fetchRoles|fetchUser|getRichPresence|ignore)\(([^)]*)\)/
        const match = text.match(commandRegex)

        if (!match) return null

        const [_, command, args] = match
        const argument = args.trim()

        switch (command) {
            case 'fetchRoles':
                if (!argument) return 'Error: Username or ID required for fetchRoles'
                const member = await this.thread?.guild?.members.fetch(argument)
                    .catch(() => this.thread?.guild?.members.cache.find(m => m.user.username === argument))
                if (!member) return `Could not find user: ${argument}`
                return member.roles.cache.map(role => role.name).join(', ')

            case 'fetchUser':
                if (!argument) return 'Error: Username or ID required for fetchUser'
                const user = await this.client?.users.fetch(argument)
                    .catch(() => this.client?.users.cache.find(u => u.username === argument))
                if (!user) return `Could not find user: ${argument}`
                return JSON.stringify({
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    createdAt: user.createdAt,
                    bot: user.bot
                }, null, 2)

            case 'getRichPresence':
                if (!argument) return 'Error: Username or ID required for getRichPresence'
                const presenceMember = await this.thread?.guild?.members.fetch(argument)
                    .catch(() => this.thread?.guild?.members.cache.find(m => m.user.username === argument))
                if (!presenceMember) return `Could not find user: ${argument}`
                const presence = presenceMember.presence
                return presence ? JSON.stringify(presence.activities, null, 2) : 'No presence data available'

            case 'ignore':
                return null

            default:
                return `Unknown command: ${command}`
        }
    }

    // History Management Methods
    private async appendMessage(role: 'system' | 'assistant' | 'user', content: string) {
        this.history.push({ role, content })
        await this.saveHistory()
    }
    private async trimHistory() {
        let historyTokens = this.history.reduce((acc, curr) => acc + (curr.content || '').split(' ').length, 0)
        while (historyTokens > 128000) {
            this.history.shift()
            historyTokens = this.history.reduce((acc, curr) => acc + (curr.content || '').split(' ').length, 0)
        }
        await this.saveHistory()
    }
    public async clearHistory() {
        this.history = [{
            role: 'system',
            content: CRIMSON_CHAT_SYSTEM_PROMPT
        }]
        await this.saveHistory()
    }
    private prepareHistory() {
        this.history = this.history.map(({ role, content }) => ({ role, content: content || '' }))
        return this.history as { role: 'system' | 'assistant' | 'user', content: string }[]
    }

    // Utility Methods
    private async parseMentions(text: string): Promise<string> {
        if (!this.client) throw new Error('Client not set')
        
        const mentionRegex = /<@!?(\d+)>/g
        let parsedText = text
        const mentions = text.matchAll(mentionRegex)
        
        for (const match of mentions) {
            const userId = match[1]
            try {
                const user = await this.client.users.fetch(userId)
                parsedText = parsedText.replace(match[0], `@${user.username}`)
            } catch (error) {
                // If user can't be fetched, leave the mention as is
                console.error(`Could not fetch user ${userId}:`, error)
            }
        }
        
        return parsedText
    }

    private async formatUserMessage(username: string, displayName: string, serverDisplayName: string, text: string, respondingTo?: { targetUsername: string; targetText: string }) {
        const parsedText = await this.parseMentions(text)
        return JSON.stringify({
            username,
            displayName,
            serverDisplayName,
            currentTime: new Date().toISOString(),
            text: parsedText,
            respondingTo
        })
    }
}
