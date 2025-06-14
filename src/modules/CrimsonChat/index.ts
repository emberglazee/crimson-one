// modules\CrimsonChat\index.ts
// modules\CrimsonChat\index.ts
import { Client, TextChannel, Message, ChatInputCommandInteraction } from 'discord.js'
import { Logger } from '../../util/logger'
import type { UserMessageOptions } from '../../types/types'
import chalk from 'chalk'
import { MessageQueue } from './MessageQueue'
import { createCrimsonChain, type CrimsonChainInput } from './chain'
import { CrimsonFileBufferHistory } from './memory'
import { usernamesToMentions } from './util/formatters'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSON_CHAT_SYSTEM_PROMPT, CRIMSON_CHAT_TEST_PROMPT, DEFAULT_GEMINI_MODEL } from '../../util/constants'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { Runnable, RunnableWithMessageHistory } from '@langchain/core/runnables'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import * as fs from 'fs/promises'
import path from 'path'
import { ImageProcessor } from './ImageProcessor'
import { BaseMessage } from '@langchain/core/messages'

const logger = new Logger('CrimsonChat')

export default class CrimsonChat {
    private static instance: CrimsonChat
    public client!: Client
    public channel: TextChannel | null = null
    private channelId = '1335992675459141632'
    private enabled = true
    private ignoredUsers: Set<string> = new Set()
    private imageProcessor: ImageProcessor

    private messageChain!: Runnable<CrimsonChainInput, BaseMessage>
    private memory: CrimsonFileBufferHistory
    private modelName: string = DEFAULT_GEMINI_MODEL

    private forceNextBreakdown = false
    private berserkMode = false
    private testMode = false
    private readonly BREAKDOWN_CHANCE = 0.01

    private constructor() {
        this.memory = new CrimsonFileBufferHistory()
        this.imageProcessor = new ImageProcessor()
    }

    public static getInstance(): CrimsonChat {
        if (!CrimsonChat.instance) {
            CrimsonChat.instance = new CrimsonChat()
        }
        return CrimsonChat.instance
    }

    public setClient(client: Client) {
        this.client = client
    }

    public async init(): Promise<void> {
        if (!this.client) throw new Error('Client not set. Call setClient() first.')

        await this.initChain()

        logger.info('Initializing CrimsonChat...')
        this.channel = (await this.client.channels.fetch(this.channelId)) as TextChannel
        if (!this.channel) {
            throw new Error(`Could not find text channel ${this.channelId}`)
        }
        await this.loadIgnoredUsers()
        logger.ok('CrimsonChat initialized successfully')
    }

    private async initChain(): Promise<void> {
        const coreChain = await createCrimsonChain(this.modelName, this.berserkMode)

        // The chain should output BaseMessage so we can inspect tool_calls.
        this.messageChain = new RunnableWithMessageHistory({
            runnable: coreChain,
            getMessageHistory: _ => this.memory,
            inputMessagesKey: 'input',
            historyMessagesKey: 'chat_history',
        })

        logger.info(`Message chain re-initialized. Model: ${chalk.green(this.modelName)}, Berserk mode: ${chalk.yellow(this.berserkMode)}`)
    }

    private async formatInput(content: string, options: UserMessageOptions): Promise<BaseMessage['content']> {
        const messageData = {
            username: options.username,
            displayName: options.displayName,
            serverDisplayName: options.serverDisplayName,
            currentTime: new Date().toISOString(),
            text: content,
            respondingTo: options.respondingTo,
            guildName: options.guildName,
            channelName: options.channelName,
        }
        // Always return as a single text part for now, image handling will be in sendMessage
        return JSON.stringify(messageData)
    }

    private async handleRandomBreakdown(): Promise<string | null> {
        if (this.testMode) return null

        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${this.forceNextBreakdown ? 'forced' : 'random'} Crimson 1 breakdown`)
            this.forceNextBreakdown = false

            const model = new ChatGoogleGenerativeAI({ model: this.modelName, apiKey: process.env.GEMINI_API_KEY })
            const response = await model.invoke(CRIMSON_BREAKDOWN_PROMPT)
            const breakdown = response.content.toString()

            await this.memory.addAIChatMessage(breakdown)
            return breakdown
        }
        return null
    }

    public async sendMessage(
        content: string,
        options: UserMessageOptions,
        originalMessage?: Message
    ): Promise<string[] | null> {
        if (!this.channel || !this.enabled) return null

        const targetChannel = options.targetChannel || this.channel
        logger.info(`Processing message from ${chalk.yellow(options.username)}...`)

        targetChannel.sendTyping().catch(e => logger.warn(`Typing indicator failed: ${e.message}`))

        const breakdown = await this.handleRandomBreakdown()
        if (breakdown) {
            await this.sendResponseToDiscord(breakdown, targetChannel, originalMessage)
            return [breakdown]
        }

        const formattedInput = await this.formatInput(content, options)
        const chatInputContent: BaseMessage['content'] = [{ type: 'text', text: formattedInput as string }]

        if (originalMessage && originalMessage.attachments.size > 0) {
            for (const attachment of originalMessage.attachments.values()) {
                if (attachment.contentType?.startsWith('image/')) {
                    logger.info(`Found image attachment: ${chalk.yellow(attachment.url)}`)
                    const imageData = await this.imageProcessor.fetchAndConvertToBase64(attachment.url)
                    if (imageData) {
                        chatInputContent.push(imageData)
                    }
                }
            }
        }

        let modelResponse: BaseMessage | undefined
        let finalResponseText: string = '-# ...' // Default in case of no response

        try {
            const humanMessage = new HumanMessage({ content: chatInputContent })

            // First invocation: LLM decides whether to respond with text or call a tool
            modelResponse = await this.messageChain.invoke(
                { input: [humanMessage] },
                { configurable: { sessionId: 'global' } }
            )

            // Cast to AIMessage to access tool_calls
            const aiMessage = modelResponse as AIMessage
            const toolCalls = aiMessage?.tool_calls

            // If tool calls are present, execute them
            if (toolCalls && toolCalls.length > 0) {
                logger.info(`Tool calls detected: ${chalk.yellow(JSON.stringify(toolCalls))}`)
                for (const toolCall of toolCalls) {
                    const toolName = toolCall.name
                    const toolArgs = toolCall.args
                    const toolId = toolCall.id

                    // Dynamically find and execute the tool function
                    // NOTE: The path should correctly resolve to the compiled JS file in your `dist` or `build` directory.
                    // Assuming modules/CrimsonChat/tools/toolName.ts compiles to modules/CrimsonChat/tools/toolName.js
                    const toolModulePath = path.join(__dirname, 'tools', `${toolName}.js`)

                    let toolResult: string
                    try {
                        const importedTool = await import(toolModulePath)
                        // LangChain's `tool` function wraps the actual function inside a `func` property.
                        if (importedTool.default && typeof importedTool.default.func === 'function') {
                            toolResult = await importedTool.default.func(toolArgs)
                            logger.info(`Tool ${toolName} execution result: ${chalk.cyan(toolResult)}`)
                        } else {
                            toolResult = `Error: Tool function '${toolName}' not found or not callable.`
                            logger.warn(toolResult)
                        }
                    } catch (e) {
                        toolResult = `Error executing tool '${toolName}': ${e instanceof Error ? e.message : String(e)}`
                        logger.error(toolResult)
                    }

                    // Add the tool's output to the chat history
                    await this.memory.addMessage(new ToolMessage({
                        tool_call_id: toolId!, // Crucial for LangChain to link tool calls to their outputs
                        content: toolResult
                    }))
                }

                // After tool execution, re-invoke the LLM without new human input.
                // It will now see the ToolMessage in history and formulate a response.
                modelResponse = await this.messageChain.invoke(
                    { input: [] }, // Empty input, as the context is now in history
                    { configurable: { sessionId: 'global' } }
                )
            }

            // Extract the final text response
            finalResponseText = (modelResponse as AIMessage)?.content?.toString() || '-# ...'

            await this.sendResponseToDiscord(finalResponseText, targetChannel, originalMessage)
            return [finalResponseText]
        } catch (e) {
            logger.warn(`Error processing message: ${chalk.red((e as Error).stack ?? (e as Error).message)}`)
            return null
        }
    }

    private async sendResponseToDiscord(response: string, targetChannel: TextChannel, originalMessage?: Message): Promise<void> {
        if (!this.client) throw new Error('Client not set')
        const messageQueue = MessageQueue.getInstance()
        const finalContent = await usernamesToMentions(this.client, response)
        const messages = this.splitMessage(finalContent.trim() || '-# ...')

        for (const message of messages) {
            messageQueue.queueMessage({ content: message, allowedMentions: { repliedUser: true } }, targetChannel, originalMessage)
            originalMessage = undefined
        }
    }

    private splitMessage(text: string): string[] {
        if (text.length <= 2000) return [text]
        const messages: string[] = []
        let currentMessage = ''
        const lines = text.split('\n')
        for (const line of lines) {
            if (currentMessage.length + line.length + 1 <= 2000) {
                currentMessage += (currentMessage ? '\n' : '') + line
            } else {
                if (currentMessage) messages.push(currentMessage)
                currentMessage = line
                if (line.length > 2000) {
                    messages.push(...(line.match(/.{1,2000}/g) || []))
                    currentMessage = ''
                }
            }
        }
        if (currentMessage) messages.push(currentMessage)
        return messages
    }

    public async handleStartup(): Promise<void> {
        if (!this.channel) return
        const startupMessage = `Discord bot initialized. Welcome back, Crimson 1! Time: ${new Date().toISOString()}`
        await this.memory.addMessages([new AIMessage(startupMessage)])
        await this.sendResponseToDiscord(startupMessage, this.channel)
    }

    public async handleShutdown(): Promise<void> {
        if (!this.channel) return
        await this.sendResponseToDiscord('⚠️ Crimson is shutting down...', this.channel)
        const shutdownMessage = `Discord bot is shutting down. See ya in a bit, Crimson 1. Time: ${new Date().toISOString()}`
        // Add a system message to the history without sending a response.
        await this.memory.addMessages([new SystemMessage(shutdownMessage)])
    }

    public async trackCommandUsage(interaction: ChatInputCommandInteraction) {
        const command = `/${interaction.commandName}`
        const options = interaction.options.data
        const optionStr = options.length > 0
            ? ' ' + options.map(opt => `${opt.name}:${opt.value ?? '[no value]'}`).join(' ')
            : ''

        const user = await this.client.users.fetch(interaction.user.id)
        const member = await interaction.guild?.members.fetch(interaction.user.id)

        const content = `Used command: ${command}${optionStr} (deferred: ${interaction.deferred})`
        const formattedInput = await this.formatInput(content, {
            username: user.username,
            displayName: user.displayName,
            serverDisplayName: member?.displayName ?? user.displayName,
            guildName: interaction.guild?.name,
            channelName: (interaction.channel as TextChannel)?.name,
        })

        // Add to history as a user message
        await this.memory.addMessage(new HumanMessage({ content: formattedInput }))
    }

    public async clearHistory(): Promise<void> {
        const prompt = this.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.memory.clear(prompt)
    }

    public async updateSystemPrompt(): Promise<void> {
        const prompt = this.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.memory.updateSystemPrompt(prompt)
    }

    public async setModel(modelName: string): Promise<void> {
        this.modelName = modelName
        await this.initChain()
        logger.ok(`CrimsonChat model switched to: ${chalk.green(modelName)}`)
    }

    public setForceNextBreakdown(force: boolean): void {
        this.forceNextBreakdown = force
        logger.ok(`Force next breakdown set to: ${chalk.yellow(force)}`)
    }

    public async toggleBerserkMode(): Promise<boolean> {
        if (this.testMode) return false
        this.berserkMode = !this.berserkMode
        await this.initChain()
        return this.berserkMode
    }

    public async setTestMode(enabled: boolean): Promise<void> {
        this.testMode = enabled
        if (enabled && this.berserkMode) {
            this.berserkMode = false
        }
        const prompt = this.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.memory.updateSystemPrompt(prompt)
        await this.initChain()
        logger.ok(`Test mode set to: ${chalk.yellow(enabled)}. System prompt updated.`)
    }

    public isTestMode(): boolean {
        return this.testMode
    }

    public isEnabled(): boolean {
        return this.enabled
    }

    public setEnabled(state: boolean): void {
        this.enabled = state
        logger.info(`CrimsonChat ${chalk.yellow(state ? 'enabled' : 'disabled')}`)
    }

    private async loadIgnoredUsers(): Promise<void> {
        const ignoredUsersPath = path.join(process.cwd(), 'data/ignored_users.json')
        try {
            const data = await fs.readFile(ignoredUsersPath, 'utf-8')
            this.ignoredUsers = new Set(JSON.parse(data))
        } catch {
            this.ignoredUsers = new Set()
        }
    }

    public isIgnored(userId: string): boolean {
        return this.ignoredUsers.has(userId)
    }

    public async ignoreUser(userId: string): Promise<void> {
        this.ignoredUsers.add(userId)
        await this.saveIgnoredUsers()
        logger.ok(`Ignored user ${chalk.yellow(userId)}`)
    }

    public async unignoreUser(userId: string): Promise<void> {
        this.ignoredUsers.delete(userId)
        await this.saveIgnoredUsers()
        logger.ok(`Unignored user ${chalk.yellow(userId)}`)
    }

    private async saveIgnoredUsers(): Promise<void> {
        const ignoredUsersPath = path.join(process.cwd(), 'data/ignored_users.json')
        try {
            await fs.mkdir(path.dirname(ignoredUsersPath), { recursive: true })
            await fs.writeFile(ignoredUsersPath, JSON.stringify([...this.ignoredUsers]))
        } catch (error) {
            console.error('Failed to save ignored users:', error)
        }
    }

    public getIgnoredUsers(): string[] {
        return [...this.ignoredUsers]
    }
}
