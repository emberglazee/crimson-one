import { green, Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat')

import { Client, TextChannel, Message, ChatInputCommandInteraction, EmbedBuilder, type MessageReplyOptions, type HexColorString } from 'discord.js'
import type { UserMessageOptions, SlashCommand, ExplicitAny } from '../../types'
import type { CommandContext } from '../CommandManager/CommandContext'
import { MessageQueue } from './MessageQueue'
import { CrimsonFileBufferHistory, type HistoryLimitMode } from './memory'
import { usernamesToMentions } from './util/formatters'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSON_CHAT_SYSTEM_PROMPT, CRIMSON_CHAT_TEST_PROMPT, DEFAULT_GEMINI_MODEL } from '../../util/constants'
import * as fs from 'fs/promises'
import path from 'path'
import { ImageProcessor } from './ImageProcessor'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { type CoreMessage, type TextPart, type ImagePart, type ToolCallPart, type ToolResultPart, generateText } from 'ai'
import { loadTools } from './tools'
import { OAuth2Client } from 'google-auth-library'
import { randomUUID } from 'crypto'

const ASSISTANT_RESPONSE_TIMEOUT_MS = 60000

interface BufferedMessage {
    content: string
    options: UserMessageOptions
    originalMessage?: Message
}

const refreshToken = process.env.GEMINI_OAUTH_REFRESH_TOKEN
const clientId = process.env.GEMINI_OAUTH_CLIENT_ID
const clientSecret = process.env.GEMINI_OAUTH_CLIENT_SECRET
const redirectUri = 'http://localhost:3000/oauth2callback'
// I specifically need a Google Cloud Project for Code Assist to work
const GOOGLE_CLOUD_PROJECT = process.env.GEMINI_GOOGLE_CLOUD_PROJECT

export default class CrimsonChat {
    private static instance: CrimsonChat
    public client!: Client
    public channel: TextChannel | null = null
    public channelId = '1335992675459141632'
    private enabled = true
    private ignoredUsers: Set<string> = new Set()
    private imageProcessor = new ImageProcessor()
    public oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri)

    private genAI = (() => {
        // --- Primary Method: OAuth 2.0 for Code Assist API ---
        if (refreshToken && clientId && clientSecret && GOOGLE_CLOUD_PROJECT) {
            logger.info('Using Code Assist API authentication via OAuth.')
            this.oauth2Client.setCredentials({ refresh_token: refreshToken })

            return createGoogleGenerativeAI({
                fetch: Object.assign(
                    async (url: RequestInfo | URL, options?: RequestInit) => {
                        const { token } = await this.oauth2Client.getAccessToken()
                        if (!token) throw new Error('Failed to retrieve access token.')

                        const urlString = typeof url === 'string' ? url : url.toString()
                        const modelMatch = urlString.match(/models\/(gemini-[^:]+)/)
                        const modelName = modelMatch ? modelMatch[1] : this.modelName

                        const finalUrl = `https://cloudcode-pa.googleapis.com/v1internal/publishers/google/models/${modelName}:generateContent`

                        let finalBody = options?.body
                        if (options?.body) {
                            try {
                                const originalBody = JSON.parse(options.body as string)
                                const wrappedBody = {
                                    model: `publishers/google/models/${modelName}`,
                                    project: GOOGLE_CLOUD_PROJECT,
                                    request: originalBody,
                                    session_id: randomUUID()
                                }
                                finalBody = JSON.stringify(wrappedBody)
                            } catch (e) {
                                logger.error(`Failed to parse and wrap request body: ${e}`)
                            }
                        }

                        const headers = new Headers(options?.headers)
                        headers.set('Authorization', `Bearer ${token}`)
                        headers.set('x-goog-api-client', 'cloud-code-fake')
                        headers.set('x-goog-cloud-project', GOOGLE_CLOUD_PROJECT)
                        headers.set('Content-Type', 'application/json')

                        const newOptions: RequestInit = {
                            ...options,
                            headers,
                            body: finalBody,
                        }

                        return fetch(finalUrl, newOptions)
                    },
                    {
                        preconnect: () => { /* Dummy to satisfy type */ }
                    }
                ),
                apiKey: 'dummy-api-key-to-satisfy-ai-sdk'
            })
        }

        // --- Fallback Method: Standard Gemini API Key ---
        const apiKey = process.env.GEMINI_API_KEY
        if (apiKey) {
            logger.info('OAuth/Code Assist credentials not found. Falling back to standard Gemini API key authentication.')
            return createGoogleGenerativeAI({
                apiKey: apiKey,
                baseURL: process.env.GEMINI_BASE_URL
            })
        }

        // --- No Credentials Found ---
        logger.warn('No valid Gemini credentials found (neither Code Assist OAuth nor API Key). CrimsonChat will not function.')
        return createGoogleGenerativeAI({ apiKey: 'dummy-key-that-will-fail' })
    })()
    private modelName = DEFAULT_GEMINI_MODEL
    private model = this.genAI(this.modelName, {
        useSearchGrounding: true
    })
    private memory = new CrimsonFileBufferHistory()

    private forceNextBreakdown = false
    private berserkMode = false
    private testMode = false
    private readonly BREAKDOWN_CHANCE = 0.01

    private isGenerating = false
    private messageBuffer: BufferedMessage[] = []

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

        logger.info('Initializing CrimsonChat...')
        this.channel = (await this.client.channels.fetch(this.channelId)) as TextChannel
        if (!this.channel) {
            throw new Error(`Could not find text channel ${this.channelId}`)
        }
        await this.loadIgnoredUsers()
        logger.ok('CrimsonChat initialized successfully')
    }

    private async handleRandomBreakdown(): Promise<string | null> {
        if (this.testMode) return null

        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${this.forceNextBreakdown ? 'forced' : 'random'} Crimson 1 breakdown`)
            this.forceNextBreakdown = false
            const result = await generateText({
                model: this.model,
                prompt: CRIMSON_BREAKDOWN_PROMPT
            })
            const breakdown = result.text

            await this.memory.addMessages([{ role: 'assistant', content: breakdown }])
            return breakdown
        }
        return null
    }

    public sendMessage(
        content: string,
        options: UserMessageOptions,
        originalMessage?: Message
    ): void {
        if (!this.channel || !this.enabled) return

        this.messageBuffer.push({ content, options, originalMessage })
        logger.info(`Message from ${yellow(options.username)} buffered. Buffer size: ${yellow(this.messageBuffer.length)}`)

        if (!this.isGenerating) {
            setImmediate(() => this._processQueue())
        }
    }

    private async _processQueue(): Promise<void> {
        if (this.isGenerating || this.messageBuffer.length === 0) return

        this.isGenerating = true
        logger.info('Starting message processing queue.')

        const messagesToProcess = [...this.messageBuffer]
        this.messageBuffer = []

        try {
            logger.info(`Processing a batch of ${yellow(messagesToProcess.length)} messages.`)
            const lastMessage = messagesToProcess[messagesToProcess.length - 1]
            const response = await this._generateResponse(messagesToProcess)

            if (response) {
                const targetChannel = lastMessage.options.targetChannel || this.channel!
                await this.sendResponseToDiscord(response, targetChannel, lastMessage.originalMessage)
            }
        } catch (error) {
            logger.error(`An error occurred in the processing queue: ${red(error instanceof Error ? error.stack ?? error.message : String(error))}`)
        } finally {
            this.isGenerating = false
            logger.info('Finished message processing queue.')

            if (this.messageBuffer.length > 0) {
                logger.info('New messages arrived during processing. Restarting queue.')
                setImmediate(() => this._processQueue())
            }
        }
    }

    private async _generateResponse(
        bufferedMessages: BufferedMessage[],
    ): Promise<string | null> {
        const lastMessage = bufferedMessages[bufferedMessages.length - 1]
        const targetChannel = lastMessage.options.targetChannel || this.channel!
        logger.info(`Generating response for a batch of ${yellow(bufferedMessages.length)} messages...`)

        targetChannel.sendTyping().catch(e => logger.warn(`Typing indicator failed: ${e.message}`))

        const breakdown = await this.handleRandomBreakdown()
        if (breakdown) {
            return breakdown
        }

        const { history, systemInstruction } = await this.memory.getHistory()

        const contentParts: (TextPart | ImagePart)[] = []

        const userMessageContext = {
            ...lastMessage.options,
            messageContent: lastMessage.content,
            channelId: lastMessage.originalMessage?.channelId,
            messageId: lastMessage.originalMessage?.id
        }
        delete userMessageContext.targetChannel
        const userMessageOptionsJson = JSON.stringify(userMessageContext)
        contentParts.push({ type: 'text', text: userMessageOptionsJson })

        for (const msg of bufferedMessages) {
            if (msg.originalMessage && msg.originalMessage.attachments.size > 0) {
                for (const attachment of msg.originalMessage.attachments.values()) {
                    if (attachment.contentType?.startsWith('image/')) {
                        logger.info(`Found image attachment: ${yellow(attachment.url)}`)
                        const imageData = await this.imageProcessor.fetchAndConvertToBase64(attachment.url)
                        if (imageData) {
                            const imageBuffer = Buffer.from(imageData.inlineData.data, 'base64')
                            contentParts.push({ type: 'image', image: imageBuffer, mimeType: imageData.inlineData.mimeType })
                        }
                    }
                }
            }
        }

        const userMessage: CoreMessage = { role: 'user', content: contentParts }
        const messages: CoreMessage[] = [...history, userMessage]

        const tools = await loadTools()

        try {
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Assistant response timed out')), ASSISTANT_RESPONSE_TIMEOUT_MS)
            )

            const rawResult = await Promise.race([
                generateText({
                    model: this.model,
                    system: systemInstruction,
                    messages: messages,
                    tools: Object.keys(tools).length > 0 ? tools : undefined,
                    temperature: this.berserkMode ? 2.0 : 0.8,
                    topP: this.berserkMode ? 1.0 : 0.95,
                    maxRetries: 10
                }),
                timeoutPromise
            ])

            // The custom fetch wrapper for the Code Assist API returns a nested response object.
            // Using `ExplicitAny` here is a deliberate choice to unwrap this specific, non-standard
            // structure without creating a complex, one-off type definition.
            const result = (rawResult as ExplicitAny).response ?? rawResult

            const { text, toolCalls, toolResults, usage } = result

            const newMessages: CoreMessage[] = [userMessage]
            if (toolCalls && toolCalls.length > 0) {
                newMessages.push({ role: 'assistant', content: toolCalls })
                for (const call of toolCalls as ToolCallPart[]) {
                    const embed = new EmbedBuilder()
                        .setColor('#FEE75C')
                        .setTitle('⚙️ Tool Call')
                        .addFields(
                            { name: 'Tool', value: `\`${call.toolName}\``, inline: true },
                            { name: 'Arguments', value: `\`\`\`json\n${JSON.stringify(call.args, null, 2)}\n\`\`\`` }
                        )
                        .setFooter({ text: `Call ID: ${call.toolCallId}` })
                        .setTimestamp()
                    await this.sendResponseToDiscord({ embeds: [embed] }, targetChannel, lastMessage.originalMessage)
                }
            }
            if (toolResults && toolResults.length > 0) {
                newMessages.push({ role: 'tool', content: toolResults })
                for (const result of toolResults as ToolResultPart[]) {
                    const resultString = typeof result.result === 'string'
                        ? result.result
                        : JSON.stringify(result.result, null, 2)

                    let parsedResult: { status: string; message: string } | null = null
                    try {
                        parsedResult = JSON.parse(resultString)
                    } catch (parseError) {
                        logger.warn(`Failed to parse tool result as JSON: ${parseError}`)
                    }

                    let embedColor: HexColorString = '#ED4245'
                    let embedTitle = '❌ Tool Failed'

                    if (parsedResult) {
                        switch (parsedResult.status) {
                            case 'success':
                                embedColor = '#57F287'
                                embedTitle = '✅ Tool Executed'
                                break
                            case 'info':
                                embedColor = '#FEE75C'
                                embedTitle = 'ℹ️ Tool Information'
                                break
                            case 'error':
                                embedColor = '#ED4245'
                                embedTitle = '❌ Tool Failed'
                                break
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setColor(embedColor)
                        .setTitle(embedTitle)
                        .addFields(
                            { name: 'Tool', value: `\`${result.toolName}\``, inline: true },
                            { name: 'Message', value: `\`\`\`\n${parsedResult ? parsedResult.message : resultString.substring(0, 1000)}\n\`\`\`` }
                        )
                        .setFooter({ text: `Call ID: ${result.toolCallId}` })
                        .setTimestamp()
                    await this.sendResponseToDiscord({ embeds: [embed] }, targetChannel, lastMessage.originalMessage)
                }
            }
            if (text) {
                newMessages.push({ role: 'assistant', content: text })
            }

            await this.memory.addMessages(newMessages, usage)

            return text
        } catch (e) {
            const error = e as Error
            if (error.message === 'Assistant response timed out') {
                logger.warn(`Assistant response timed out after ${ASSISTANT_RESPONSE_TIMEOUT_MS / 1000} seconds. Ignoring response.`)
                return null
            }
            logger.warn(`Error processing message: ${red(error.stack ?? error.message)}`)
            return null
        }
    }

    private async sendResponseToDiscord(response: string | MessageReplyOptions, targetChannel: TextChannel, originalMessage?: Message): Promise<void> {
        if (!this.client) throw new Error('Client not set')
        const messageQueue = MessageQueue.getInstance()

        if (typeof response === 'string') {
            const finalContent = await usernamesToMentions(this.client, response)
            const messages = this.splitMessage(finalContent.trim())

            let isFirst = true
            for (const message of messages) {
                const replyTo = isFirst ? originalMessage : undefined
                messageQueue.queueMessage({ content: message, allowedMentions: { repliedUser: !!replyTo } }, targetChannel, replyTo)
                isFirst = false
            }
        } else {
            const replyTo = originalMessage
            messageQueue.queueMessage({ ...response, allowedMentions: { repliedUser: !!replyTo, parse: [] } }, targetChannel, replyTo)
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
                if (line.length > 2000) {
                    messages.push(...(line.match(/.{1,2000}/g) || []))
                    currentMessage = ''
                } else {
                    currentMessage = line
                }
            }
        }
        if (currentMessage) messages.push(currentMessage)
        return messages
    }

    public async trackCommandUsage(interaction: ChatInputCommandInteraction) {
        const command = `/${interaction.commandName}`
        const options = interaction.options.data
        const optionStr = options.length > 0
            ? ' ' + options.map(opt => `${opt.name}:${opt.value ?? '[no value]'}`).join(' ')
            : ''

        const user = await this.client.users.fetch(interaction.user.id)

        const content = `User ${user.username} used command: ${command}${optionStr} (in server: ${interaction.guild?.name}, channel: ${(interaction.channel as TextChannel)?.name})`

        await this.memory.addMessages([{ role: 'user', content }])
    }

    public async logCommandExecution(command: SlashCommand, context: CommandContext) {
        const commandName = command.data.name
        const user = context.user
        const args = context.args.join(' ')
        const response = context.chainedReplies.map(r => r.content).join('')
        const executionDetails = {
            command: commandName,
            user: user.username,
            arguments: args,
            response: response
        }
        const content = `Command execution: ${JSON.stringify(executionDetails, null, 2)}`
        await this.memory.addMessages([{ role: 'user', content }])
    }

    public async clearHistory(): Promise<void> {
        const prompt = this.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.memory.clear(prompt)
    }

    public async updateSystemPrompt(): Promise<void> {
        const prompt = this.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.memory.updateSystemPrompt(prompt)
    }

    public setModel(modelName: string): void {
        this.modelName = modelName
        logger.ok(`CrimsonChat model switched to: ${green(modelName)}`)
    }

    public async setHistoryLimit(mode: HistoryLimitMode, limit: number): Promise<void> {
        await this.memory.setHistoryLimit(mode, limit)
    }

    public setForceNextBreakdown(force: boolean): void {
        this.forceNextBreakdown = force
        logger.ok(`Force next breakdown set to: ${yellow(force)}`)
    }

    public async toggleBerserkMode(): Promise<boolean> {
        if (this.testMode) return false
        this.berserkMode = !this.berserkMode
        return this.berserkMode
    }

    public async setTestMode(enabled: boolean): Promise<void> {
        this.testMode = enabled
        if (enabled && this.berserkMode) {
            this.berserkMode = false
        }
        await this.updateSystemPrompt()
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

