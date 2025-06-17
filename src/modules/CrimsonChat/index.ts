import { cyan, green, Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat')

import { Client, TextChannel, Message, ChatInputCommandInteraction } from 'discord.js'
import type { UserMessageOptions } from '../../types'
import { MessageQueue } from './MessageQueue'
import { CrimsonFileBufferHistory } from './memory'
import { usernamesToMentions } from './util/formatters'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSON_CHAT_SYSTEM_PROMPT, CRIMSON_CHAT_TEST_PROMPT, DEFAULT_GEMINI_MODEL } from '../../util/constants'
import * as fs from 'fs/promises'
import path from 'path'
import { ImageProcessor } from './ImageProcessor'
import { GoogleGenerativeAI, GenerativeModel, type Part, ChatSession } from '@google/generative-ai'
import { loadTools, toolMap } from './tools'

export default class CrimsonChat {
    private static instance: CrimsonChat
    public client!: Client
    public channel: TextChannel | null = null
    private channelId = '1335992675459141632'
    private enabled = true
    private ignoredUsers: Set<string> = new Set()
    private imageProcessor: ImageProcessor

    private genAI: GoogleGenerativeAI
    private model!: GenerativeModel
    private chatSession!: ChatSession
    private memory: CrimsonFileBufferHistory
    private modelName: string = DEFAULT_GEMINI_MODEL

    private forceNextBreakdown = false
    private berserkMode = false
    private testMode = false
    private readonly BREAKDOWN_CHANCE = 0.01

    private isGenerating = false
    private messageBuffer: {
        content: string
        options: UserMessageOptions
        originalMessage?: Message
    }[] = []

    private constructor() {
        this.memory = new CrimsonFileBufferHistory()
        this.imageProcessor = new ImageProcessor()
        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set in environment variables')
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
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

        await this.initModelAndSession()

        logger.info('Initializing CrimsonChat...')
        this.channel = (await this.client.channels.fetch(this.channelId)) as TextChannel
        if (!this.channel) {
            throw new Error(`Could not find text channel ${this.channelId}`)
        }
        await this.loadIgnoredUsers()
        logger.ok('CrimsonChat initialized successfully')
    }

    private async initModelAndSession(): Promise<void> {
        const tools = await loadTools()

        const generationConfig = this.berserkMode
            ? { temperature: 2.0, topP: 1.0 }
            : { temperature: 0.8 }

        const { history, systemInstruction } = await this.memory.getHistory()

        this.model = this.genAI.getGenerativeModel({
            model: this.modelName,
            tools: tools.length > 0 ? tools : undefined,
            systemInstruction,
            generationConfig
        })

        this.chatSession = this.model.startChat({
            history
        })

        logger.info(`Model and chat session re-initialized. Model: ${green(this.modelName)}, Berserk mode: ${yellow(this.berserkMode)}`)
    }

    private async formatInput(content: string, options: UserMessageOptions): Promise<string> {
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
        return JSON.stringify(messageData)
    }

    private async handleRandomBreakdown(): Promise<string | null> {
        if (this.testMode) return null

        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${this.forceNextBreakdown ? 'forced' : 'random'} Crimson 1 breakdown`)
            this.forceNextBreakdown = false

            const model = this.genAI.getGenerativeModel({ model: this.modelName })
            const result = await model.generateContent(CRIMSON_BREAKDOWN_PROMPT)
            const breakdown = result.response.text()

            await this.memory.addMessages([{ role: 'model', parts: [{ text: breakdown }] }])
            return breakdown
        }
        return null
    }

    /**
     * Enqueues a message for processing and starts the processing loop if not already running.
     * This is the new public entry point for messages.
     */
    public sendMessage(
        content: string,
        options: UserMessageOptions,
        originalMessage?: Message
    ): void {
        if (!this.channel || !this.enabled) return

        this.messageBuffer.push({ content, options, originalMessage })
        logger.info(`Message from ${yellow(options.username)} buffered. Buffer size: ${yellow(this.messageBuffer.length)}`)

        // If the queue is not already being processed, start it.
        if (!this.isGenerating) {
            // Use setImmediate to avoid blocking the event loop and prevent deep recursion.
            setImmediate(() => this._processQueue())
        }
    }

    /**
     * Processes the message queue, handling one message and then any subsequent buffered messages in bulk.
     */
    private async _processQueue(): Promise<void> {
        // Lock to prevent concurrent execution
        if (this.isGenerating) return
        this.isGenerating = true
        logger.info('Starting message processing queue.')

        try {
            // Continue as long as there are messages to process
            while (this.messageBuffer.length > 0) {
                // 1. Process the first message in the queue
                const firstMessage = this.messageBuffer.shift()
                if (!firstMessage) continue

                logger.info(`Processing single message from ${yellow(firstMessage.options.username)}`)
                const response = await this._generateResponse(
                    firstMessage.content,
                    firstMessage.options,
                    firstMessage.originalMessage
                )

                if (response) {
                    const targetChannel = firstMessage.options.targetChannel || this.channel!
                    await this.sendResponseToDiscord(response, targetChannel, firstMessage.originalMessage)
                }

                // 2. After responding, check for and process any messages that were buffered during generation
                if (this.messageBuffer.length > 0) {
                    const bulkMessages = [...this.messageBuffer]
                    this.messageBuffer = [] // Clear buffer for the next cycle
                    logger.info(`Processing a bulk of ${yellow(bulkMessages.length)} buffered messages.`)

                    const combinedContent = bulkMessages.map(msg =>
                        JSON.stringify({
                            username: msg.options.username,
                            displayName: msg.options.displayName,
                            text: msg.content,
                        })
                    ).join('\n')

                    const bulkOptions: UserMessageOptions = {
                        username: 'System',
                        displayName: 'System',
                        serverDisplayName: 'System',
                    }

                    const lastMessageInBulk = bulkMessages[bulkMessages.length - 1]
                    const bulkPrompt = `The following messages were sent in rapid succession while you were generating your previous response. Respond to them as a whole:\n\n${combinedContent}`

                    const bulkResponse = await this._generateResponse(
                        bulkPrompt,
                        bulkOptions,
                        lastMessageInBulk.originalMessage
                    )

                    if (bulkResponse) {
                        const targetChannel = lastMessageInBulk.options.targetChannel || this.channel!
                        await this.sendResponseToDiscord(bulkResponse, targetChannel, lastMessageInBulk.originalMessage)
                    }
                }
            }
        } catch (error) {
            logger.error(`An error occurred in the processing queue: ${red(error instanceof Error ? error.stack ?? error.message : String(error))}`)
            // Clear buffer on error to prevent getting stuck on a "poison" message
            this.messageBuffer = []
        } finally {
            // Unlock the queue once it's empty
            this.isGenerating = false
            logger.info('Finished message processing queue.')

            // Final check to catch any messages that arrived during the 'finally' block
            if (this.messageBuffer.length > 0) {
                logger.info('New messages arrived during finalization. Restarting queue.')
                setImmediate(() => this._processQueue())
            }
        }
    }

    /**
     * Core logic for a single LLM interaction cycle (for both single and bulk messages).
     * @returns The generated text response or null on error.
     */
    private async _generateResponse(
        content: string,
        options: UserMessageOptions,
        originalMessage?: Message
    ): Promise<string | null> {
        const targetChannel = options.targetChannel || this.channel!
        logger.info(`Generating response for ${yellow(options.username)}...`)

        targetChannel.sendTyping().catch(e => logger.warn(`Typing indicator failed: ${e.message}`))

        const breakdown = await this.handleRandomBreakdown()
        if (breakdown) {
            return breakdown
        }

        const formattedInput = await this.formatInput(content, options)
        const parts: Part[] = [{ text: formattedInput }]

        if (originalMessage && originalMessage.attachments.size > 0) {
            for (const attachment of originalMessage.attachments.values()) {
                if (attachment.contentType?.startsWith('image/')) {
                    logger.info(`Found image attachment: ${yellow(attachment.url)}`)
                    const imageData = await this.imageProcessor.fetchAndConvertToBase64(attachment.url)
                    if (imageData) {
                        parts.push(imageData)
                    }
                }
            }
        }

        // Save user message to memory
        await this.memory.addMessages([{ role: 'user', parts }])

        try {
            let result = await this.chatSession.sendMessage(parts)

            // --- Tool Calling Loop ---
            while (true) {
                const call = result.response.functionCalls()?.[0]
                if (!call) {
                    break // No more tool calls, exit loop
                }

                logger.info(`Tool call detected: ${yellow(call.name)}(${cyan(JSON.stringify(call.args))})`)

                // Save model's tool call to history
                await this.memory.addMessages([{ role: 'model', parts: [{ functionCall: call }] }])

                const toolToExecute = toolMap.get(call.name)
                let toolResultContent: string

                if (toolToExecute) {
                    try {
                        toolResultContent = await toolToExecute.invoke(call.args)
                        logger.info(`Tool ${call.name} execution result: ${cyan(toolResultContent)}`)
                    } catch (e) {
                        toolResultContent = `Error executing tool '${call.name}': ${e instanceof Error ? e.message : String(e)}`
                        logger.error(toolResultContent)
                    }
                } else {
                    toolResultContent = `Error: Tool '${call.name}' not found.`
                    logger.warn(toolResultContent)
                }

                const functionResponsePart: Part = {
                    functionResponse: {
                        name: call.name,
                        response: {
                            name: call.name, // The tool name
                            content: toolResultContent,
                        },
                    },
                }

                // Save tool response to history
                await this.memory.addMessages([{ role: 'function', parts: [functionResponsePart] }])

                // Send tool response back to the model
                result = await this.chatSession.sendMessage([functionResponsePart])
            }
            // --- End Tool Calling Loop ---

            const responseText = result.response.text()
            // Save final AI response to memory
            await this.memory.addMessages([{ role: 'model', parts: [{ text: responseText }] }])

            return responseText || '-# ...'
        } catch (e) {
            logger.warn(`Error processing message: ${red((e as Error).stack ?? (e as Error).message)}`)
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
        await this.memory.addMessages([{ role: 'model', parts: [{ text: startupMessage }] }])
        await this.sendResponseToDiscord(startupMessage, this.channel)
    }

    public async handleShutdown(): Promise<void> {
        if (!this.channel) return
        await this.sendResponseToDiscord('⚠️ Crimson is shutting down...', this.channel)
        const shutdownMessage = `Discord bot is shutting down. See ya in a bit, Crimson 1. Time: ${new Date().toISOString()}`
        // Add a system message to the history without sending a response.
        await this.memory.addMessages([{ role: 'user', parts: [{ text: shutdownMessage }] }])
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
        await this.memory.addMessages([{ role: 'user', parts: [{ text: formattedInput }] }])
    }

    public async clearHistory(): Promise<void> {
        const prompt = this.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.memory.clear(prompt)
        await this.initModelAndSession()
    }

    public async updateSystemPrompt(): Promise<void> {
        const prompt = this.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.memory.updateSystemPrompt(prompt)
        await this.initModelAndSession()
    }

    public async setModel(modelName: string): Promise<void> {
        this.modelName = modelName
        await this.initModelAndSession()
        logger.ok(`CrimsonChat model switched to: ${green(modelName)}`)
    }

    public setForceNextBreakdown(force: boolean): void {
        this.forceNextBreakdown = force
        logger.ok(`Force next breakdown set to: ${yellow(force)}`)
    }

    public async toggleBerserkMode(): Promise<boolean> {
        if (this.testMode) return false
        this.berserkMode = !this.berserkMode
        await this.initModelAndSession()
        return this.berserkMode
    }

    public async setTestMode(enabled: boolean): Promise<void> {
        this.testMode = enabled
        if (enabled && this.berserkMode) {
            this.berserkMode = false
        }
        await this.updateSystemPrompt() // This will also call initModelAndSession
        logger.ok(`Test mode set to: ${yellow(enabled)}. System prompt updated.`)
    }

    public isTestMode(): boolean {
        return this.testMode
    }

    public isEnabled(): boolean {
        return this.enabled
    }

    public setEnabled(state: boolean): void {
        this.enabled = state
        logger.info(`CrimsonChat ${green(state ? 'enabled' : 'disabled')}`)
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
        logger.ok(`Ignored user ${yellow(userId)}`)
    }

    public async unignoreUser(userId: string): Promise<void> {
        this.ignoredUsers.delete(userId)
        await this.saveIgnoredUsers()
        logger.ok(`Unignored user ${yellow(userId)}`)
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
