import type { Client, TextChannel, ChatInputCommandInteraction, CommandInteractionOption, CacheType } from 'discord.js'
import OpenAI from 'openai'
import { CRIMSON_CHAT_SYSTEM_PROMPT } from '../util/constants'
import type { ChatCompletionMessage } from 'openai/resources/index.mjs'
import { promises as fs } from 'fs'
import path from 'path'
import { Logger } from '../util/logger'
import Vision from './Vision'
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

    // Track slash command usage in the thread
    public async trackCommandUsage(interaction: ChatInputCommandInteraction) {
        const command = `/${interaction.commandName}`
        const options = interaction.options.data
        const optionStr = options.length > 0 
            ? ' ' + options.map((opt: CommandInteractionOption<CacheType>) => `${opt.name}:${opt.value ?? '[no value]'}`).join(' ')
            : ''

        const message = await this.formatUserMessage(
            interaction.user.username,
            interaction.user.displayName,
            interaction.user.displayName, // Fallback to user displayName since member might not be available
            `Used command: ${command}${optionStr}`
        )

        this.appendMessage('user', message)
        this.trimHistory()
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

        logger.info('Initializing CrimsonChat...')
        this.thread = await this.client.channels.fetch(this.threadId) as TextChannel
        if (!this.thread) {
            logger.error('Could not find webhook thread')
            throw new Error('Could not find webhook thread')
        }
        
        await this.loadHistory()
        await Vision.getInstance().init()
        logger.ok('CrimsonChat initialized successfully')
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
            logger.warn(`Message from ${options.username} ignored - already processing another message`)
            await originalMessage.react('❌').catch((err: Error) => {
                logger.error(`Failed to add reaction: ${err.message}`)
            })
            return
        }

        logger.info(`Processing message from ${options.username}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`)
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
                logger.info('Sending request to OpenAI...')
                let response;
                try {
                    response = await this.openai.chat.completions.create({
                        messages: this.prepareHistory(),
                        model: 'gpt-4o-mini'
                    })
                } catch (apiError: any) {
                    // Handle specific OpenAI API errors
                    if (apiError.status === 429) {
                        logger.error('Rate limit exceeded with OpenAI API')
                        await this.thread.send('❌ Hit a ChatGPT rate limit, try again in a bit.')
                        return
                    } else if (apiError.status === 500) {
                        logger.error('OpenAI API internal server error')
                        await this.thread.send('❌ ChatGPT API internal error, is it down?')
                        return
                    } else {
                        logger.error(`OpenAI API error: ${apiError.message}`)
                        await this.thread.send('⚠️ Unknown error with ChatGPT, try again later.')
                        return
                    }
                }

                if (!response?.choices?.[0]?.message) {
                    logger.error('Invalid response format from OpenAI')
                    await this.thread.send('❌ ChatGPT response was invalid, try again later.')
                    return
                }

                const message = response.choices[0].message
                logger.info(`Received response from OpenAI: ${message.content?.substring(0, 50)}${message.content && message.content.length > 50 ? '...' : ''}`)

                try {
                    const { content: parsedResponse, hadCommands } = await this.parseAssistantReply(message)

                    if (parsedResponse === null) {
                        logger.info('Message ignored via !ignore command')
                        this.isProcessing = false
                        return
                    }

                    // Always keep the original message in history
                    this.appendMessage('assistant', message.content || '')

                    if (!hadCommands) {
                        logger.info('No more commands to process, sending final response')
                        await this.sendResponseToDiscord(parsedResponse, message)
                        hasMoreCommands = false
                    } else {
                        logger.info('Commands found in response, continuing chain')
                        this.appendMessage('system', parsedResponse)
                    }
                } catch (parseError: any) {
                    logger.error(`Error parsing assistant reply: ${parseError.message}`)
                    await this.thread.send('Sorry, I encountered an error while processing the response.')
                    return
                }
            }
        } catch (error: any) {
            logger.error(`Error processing message: ${error.message}`)
            try {
                await this.thread.send('Sorry, something went wrong while processing your message. Please try again later.')
            } catch (sendError) {
                logger.error(`Failed to send error message: ${sendError}`)
            }
        } finally {
            this.isProcessing = false
            logger.info('Message processing completed')
        }
    }

    private async parseAssistantReply(message: ChatCompletionMessage): Promise<{ content: string | null; hadCommands: boolean }> {
        try {
            const content = message.content
            if (!content) return { content: null, hadCommands: false }

            // Look for commands in the message
            const commandRegex = /!(fetchRoles|fetchUser|getRichPresence|ignore|describeImage)\([^)]*\)/g
            const commands = content.match(commandRegex)

            if (!commands) return { content, hadCommands: false }

            logger.info(`Found ${commands.length} commands in response`)

            // Process each command and replace it in the message
            let modifiedContent = content
            for (const command of commands) {
                logger.info(`Processing command: ${command}`)
                try {
                    const response = await this.parseCommand(command)
                    if (response === null) return { content: null, hadCommands: true } // ignore() was called
                    modifiedContent = modifiedContent.replace(command, `${command} -> ${response}`)
                } catch (cmdError: any) {
                    logger.error(`Error processing command ${command}: ${cmdError.message}`)
                    modifiedContent = modifiedContent.replace(command, `${command} -> Error: ${cmdError.message}`)
                }
            }

            return { content: modifiedContent, hadCommands: true }
        } catch (error: any) {
            logger.error(`Error in parseAssistantReply: ${error.message}`)
            throw error
        }
    }

    private async sendResponseToDiscord(content: string, message?: ChatCompletionMessage): Promise<void> {
        if (!this.thread) throw new Error('Thread not set')

        try {
            let finalContent = content
            if (message?.refusal) {
                finalContent += '\n-# ⚠️ note: this chatgpt response is `message.refusal`, what the FUCK is wrong with yall what have yall done to it 😭\n-# - emberglaze'
            }

            // If content is over 2000 characters, send as a file
            if (finalContent.length > 2000) {
                const buffer = Buffer.from(finalContent, 'utf-8')
                await this.thread.send({
                    files: [{
                        attachment: buffer,
                        name: 'response.txt'
                    }]
                }).catch(err => {
                    logger.error(`Failed to send file response: ${err.message}`)
                    throw new Error('Failed to send file response')
                })
            } else {
                await this.thread.send(finalContent).catch(err => {
                    logger.error(`Failed to send message: ${err.message}`)
                    throw new Error('Failed to send message')
                })
            }
        } catch (error: any) {
            logger.error(`Error sending response to Discord: ${error.message}`)
            throw error
        }
    }

    private async parseCommand(text: string): Promise<string | null> {
        // Command regex with argument capture
        const commandRegex = /!(fetchRoles|fetchUser|getRichPresence|ignore|describeImage|getEmojis)\(([^)]*)\)/
        const match = text.match(commandRegex)

        if (!match) return null

        const [_, command, args] = match
        const argument = args.trim()
        logger.info(`Executing command ${command} with args: ${argument}`)

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

            case 'describeImage':
                if (!argument) return 'Error: Image URL required for describeImage'
                try {
                    const description = await Vision.getInstance().captionImage(argument)
                    return `Image Description: ${description}`
                } catch (error) {
                    return `Error describing image: ${error instanceof Error ? error.message : 'Unknown error'}`
                }

            case 'getEmojis':
                try {
                    const emojisPath = path.join(process.cwd(), 'data', 'emojis.json')
                    const emojisData = await fs.readFile(emojisPath, 'utf-8')
                    const emojis = JSON.parse(emojisData)
                    return JSON.stringify(emojis, null, 2)
                } catch (error) {
                    return `Error reading emojis: ${error instanceof Error ? error.message : 'Unknown error'}`
                }

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
        logger.info(`Appended ${role} message to history`)
    }
    private async trimHistory() {
        const originalLength = this.history.length
        let historyTokens = this.history.reduce((acc, curr) => acc + (curr.content || '').split(' ').length, 0)
        while (historyTokens > 128000) {
            this.history.shift()
            historyTokens = this.history.reduce((acc, curr) => acc + (curr.content || '').split(' ').length, 0)
        }
        if (originalLength !== this.history.length) {
            logger.info(`Trimmed history from ${originalLength} to ${this.history.length} messages`)
        }
        await this.saveHistory()
    }
    public async clearHistory() {
        logger.info('Clearing chat history')
        this.history = [{
            role: 'system',
            content: CRIMSON_CHAT_SYSTEM_PROMPT
        }]
        await this.saveHistory()
        logger.ok('Chat history cleared')
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

    private async formatUserMessage(username: string, displayName: string, serverDisplayName: string, text: string, respondingTo?: { targetUsername: string; targetText: string }, attachments?: string[]) {
        const parsedText = await this.parseMentions(text)
        return JSON.stringify({
            username,
            displayName,
            serverDisplayName,
            currentTime: new Date().toISOString(),
            text: parsedText,
            attachments,
            respondingTo
        })
    }
}
