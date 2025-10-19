import { singleton, inject } from 'tsyringe'
import { Logger } from '../Logger'
import { green, yellow, red } from '../../util/colors'
const logger = new Logger('CrimsonChat')

import { Client, TextChannel, Message, ChatInputCommandInteraction, EmbedBuilder, type MessageReplyOptions, type HexColorString } from 'discord.js'
import type { UserMessageOptions, SlashCommand } from '../../types'
import type { CommandContext } from '../'
import { MessageQueue } from './MessageQueue'
import { CrimsonChatState, type HistoryLimitMode } from './memory'
import { usernamesToMentions } from './util/formatters'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSON_CHAT_SYSTEM_PROMPT, CRIMSON_CHAT_TEST_PROMPT } from '../../util/constants'
import { ImageProcessor } from './ImageProcessor'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { ModelMessage, TextPart, ImagePart } from 'ai'
import { generateText } from 'ai'
import { getTools } from './tools'
import { EventEmitter } from 'tseep'
import { parseAIResponse, stripToolCalls, type ParsedToolCall } from './util/xmlParser'
import { ToolRegistry } from './ToolRegistry'
import path from 'path'

const ASSISTANT_RESPONSE_TIMEOUT_MS = 60000

interface BufferedMessage {
    content: string
    options: UserMessageOptions
    originalMessage?: Message
}

@singleton()
export class CrimsonChat extends EventEmitter<{
    statusChange: () => void
}> {
    public channel: TextChannel | null = null
    public channelId = '1335992675459141632'

    private voidai = createOpenAICompatible({
        name: 'voidai',
        baseURL: 'http://localhost:11434/v1',
        apiKey: process.env.OPENAI_API_KEY
    })

    private forceNextBreakdown = false
    private readonly BREAKDOWN_CHANCE = 0.01

    private isGenerating = false
    private messageBuffer: BufferedMessage[] = []

    public constructor(
        @inject('Client') private client: Client,
        public state: CrimsonChatState,
        private imageProcessor: ImageProcessor,
        private messageQueue: MessageQueue,
        private toolRegistry: ToolRegistry
    ) {
        super()
    }

    public async init(): Promise<void> {
        logger.info('Initializing CrimsonChat...')
        this.channel = (await this.client.channels.fetch(this.channelId)) as TextChannel
        if (!this.channel) {
            throw new Error(`Could not find text channel ${this.channelId}`)
        }
        await this.toolRegistry.loadTools(path.join(__dirname, 'tools'))
        // State is loaded in its own constructor now
        logger.ok('CrimsonChat initialized successfully')
    }

    private async handleRandomBreakdown(): Promise<string | null> {
        if (this.state.testMode) return null

        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${this.forceNextBreakdown ? 'forced' : 'random'} Crimson 1 breakdown`)
            this.forceNextBreakdown = false
            const result = await generateText({
                model: this.voidai(this.state.modelName),
                prompt: CRIMSON_BREAKDOWN_PROMPT
            })
            const breakdown = result.text

            await this.state.addMessages([{ role: 'assistant', content: breakdown }])
            return breakdown
        }
        return null
    }

    public sendMessage(
        content: string,
        options: UserMessageOptions,
        originalMessage?: Message
    ): void {
        if (!this.channel || !this.state.enabled) return

        this.messageBuffer.push({ content, options, originalMessage })
        logger.debug(`Message from ${yellow(options.username)} buffered. Buffer size: ${yellow(this.messageBuffer.length)}`)

        if (!this.isGenerating) {
            setImmediate(() => this._processQueue())
        }
    }

    private async _processQueue(): Promise<void> {
        if (this.isGenerating || this.messageBuffer.length === 0) return

        this.isGenerating = true
        logger.debug('Starting message processing queue.')

        const messagesToProcess = [...this.messageBuffer]
        this.messageBuffer = []

        try {
            logger.debug(`Processing a batch of ${yellow(messagesToProcess.length)} messages.`)
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
            logger.debug('Finished message processing queue.')

            if (this.messageBuffer.length > 0) {
                logger.debug('New messages arrived during processing. Restarting queue.')
                setImmediate(() => this._processQueue())
            }
        }
    }

    private async _generateResponse(
        bufferedMessages: BufferedMessage[]
    ): Promise<string | null> {
        const lastMessage = bufferedMessages[bufferedMessages.length - 1]
        const targetChannel = lastMessage.options.targetChannel || this.channel!
        logger.debug(`Generating response for a batch of ${yellow(bufferedMessages.length)} messages...`)

        const typingInterval = setInterval(() => {
            targetChannel.sendTyping().catch(e => logger.warn(`Typing indicator loop failed: ${e.message}`))
        }, 9000)

        try {
            targetChannel.sendTyping().catch(e => logger.warn(`Typing indicator failed: ${e.message}`))

            const breakdown = await this.handleRandomBreakdown()
            if (breakdown) {
                return breakdown
            }

            const state = await this.state.getState()

            // Dynamically add tool definitions to the system prompt
            let systemPrompt = state.systemPrompt
            const toolDefinitions = this._getToolDefinitionsPrompt()
            if (toolDefinitions) {
                systemPrompt += `\n\nAvailable tools:\n${toolDefinitions}`
            }

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
                                contentParts.push({ type: 'image', image: imageBuffer, mediaType: imageData.inlineData.mimeType })
                            }
                        }
                    }
                }
            }

            const initialUserMessage: ModelMessage = { role: 'user', content: contentParts }
            const messages: ModelMessage[] = [...state.history, initialUserMessage]

            let lastResponseText: string | null = null
            let lastUsage: { inputTokens?: number, outputTokens?: number } | null = null
            let toolCalls: ParsedToolCall[] = []
            let normalText: string | null = null
            const MAX_RETRIES = 3

            for (let i = 0; i < MAX_RETRIES; i++) {
                try {
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Assistant response timed out')), ASSISTANT_RESPONSE_TIMEOUT_MS)
                    )

                    const result = await Promise.race([
                        generateText({
                            model: this.voidai(this.state.modelName),
                            system: systemPrompt,
                            messages,
                            temperature: this.state.berserkMode ? 2.0 : 0.8,
                            topP: this.state.berserkMode ? 1.0 : 0.95,
                            maxRetries: 10
                        }),
                        timeoutPromise
                    ])

                    if (!result) {
                        logger.warn('generateText returned null or was rejected.')
                        if (i === MAX_RETRIES - 1) return null
                        continue
                    }
                    lastResponseText = result.text
                    lastUsage = result.usage
                    const parsedResponse = parseAIResponse(lastResponseText)
                    toolCalls = parsedResponse.toolCalls
                    normalText = parsedResponse.normalText
                    const invalidToolCall = toolCalls.find((call: ParsedToolCall) => !this.toolRegistry.tools.has(call.toolName))

                    if (invalidToolCall) {
                        logger.warn(`Model attempted to call an invalid tool: "${invalidToolCall.toolName}". Retrying... (${i + 1}/${MAX_RETRIES})`)

                        const toolList = this._getToolDefinitionsPrompt()
                        const correctionMessage: ModelMessage = {
                            role: 'user',
                            content: `Invalid tool call detected: "${invalidToolCall.toolName}". This tool does not exist. Please choose from the available tools:\n${toolList}`
                        }
                        messages.push({ role: 'assistant', content: lastResponseText }) // Add the failed response to history
                        messages.push(correctionMessage) // Add the correction
                        continue // Retry the loop
                    }

                    // If all tool calls are valid, or there are no tool calls, break the loop
                    break

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

            if (!lastResponseText || !lastUsage) {
                logger.error('Failed to get a valid response from the model after multiple retries.')
                return null
            }
            // Execute tools if any are found
            if (toolCalls.length > 0) {
                await this._executeToolCalls(toolCalls, targetChannel, lastMessage.originalMessage)
            }

            // Add messages to history
            const newMessages: ModelMessage[] = [initialUserMessage]
            const assistantResponse = normalText || stripToolCalls(lastResponseText)
            if (assistantResponse) {
                newMessages.push({ role: 'assistant', content: assistantResponse })
            }

            await this.state.addMessages(newMessages, {
                promptTokens: lastUsage.inputTokens!,
                completionTokens: lastUsage.outputTokens!
            })
            return normalText || stripToolCalls(lastResponseText)
        } finally {
            clearInterval(typingInterval)
        }
    }

    private async _executeToolCalls(
        toolCalls: ParsedToolCall[],
        targetChannel: TextChannel,
        originalMessage?: Message
    ): Promise<void> {
        const tools = getTools()

        for (const call of toolCalls) {
            const tool = tools.get(call.toolName)
            if (!tool) {
                logger.warn(`Unknown tool call: ${call.toolName}`)
                continue
            }

            // Display "Thinking..." embed
            const thinkingEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('⚙️ Tool Call')
                .addFields(
                    { name: 'Tool', value: `\`${call.toolName}\``, inline: true },
                    { name: 'Arguments', value: `\`\`\`xml\n${Object.entries(call.args).map(([key, value]) => `<${key}>${value}</${key}>`).join('\n')}\n\`\`\`` }
                )
                .setFooter({ text: 'Executing...' })
                .setTimestamp()

            const thinkingMessage = await this.sendResponseToDiscord({ embeds: [thinkingEmbed] }, targetChannel, originalMessage)

            try {
                // Parameter validation and type casting
                const validatedArgs: Record<string, any> = {}
                for (const param of tool.parameters) {
                    const argValue = call.args[param.name]
                    if (param.required && argValue === undefined) {
                        throw new Error(`Missing required parameter: ${param.name}`)
                    }
                    if (argValue !== undefined) {
                        if (param.type === 'number') {
                            validatedArgs[param.name] = Number(argValue)
                            if (isNaN(validatedArgs[param.name])) {
                                throw new Error(`Invalid number for parameter ${param.name}: ${argValue}`)
                            }
                        } else if (param.type === 'boolean') {
                            validatedArgs[param.name] = argValue.toLowerCase() === 'true'
                        } else {
                            validatedArgs[param.name] = argValue
                        }
                    }
                }

                const resultString = await tool.execute(validatedArgs, { client: this.client })

                let parsedResult: { status: string, message: string } | null = null
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

                const resultEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(embedTitle)
                    .addFields(
                        { name: 'Tool', value: `\`${tool.name}\``, inline: true },
                        { name: 'Result', value: `\`\`\`\n${parsedResult ? parsedResult.message : resultString.substring(0, 1000)}\n\`\`\`` }
                    )
                    .setTimestamp()

                if (thinkingMessage) {
                    await thinkingMessage.edit({ embeds: [resultEmbed] })
                } else {
                    await this.sendResponseToDiscord({ embeds: [resultEmbed] }, targetChannel, originalMessage)
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
                logger.error(`Tool execution failed for ${tool.name}: ${red(errorMessage)}`)
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setTitle('❌ Tool Failed')
                    .addFields(
                        { name: 'Tool', value: `\`${tool.name}\``, inline: true },
                        { name: 'Error', value: `\`\`\`\n${errorMessage}\n\`\`\`` }
                    )
                    .setTimestamp()

                if (thinkingMessage) {
                    await thinkingMessage.edit({ embeds: [errorEmbed] })
                } else {
                    await this.sendResponseToDiscord({ embeds: [errorEmbed] }, targetChannel, originalMessage)
                }
            }
        }
    }

    private async sendResponseToDiscord(response: string | MessageReplyOptions, targetChannel: TextChannel, originalMessage?: Message): Promise<Message | void> {
        if (!this.client) throw new Error('Client not set')

        if (typeof response === 'string') {
            const finalContent = await usernamesToMentions(this.client, response)
            const messages = this.splitMessage(finalContent.trim())

            let isFirst = true
            for (const message of messages) {
                const replyTo = isFirst ? originalMessage : undefined
                return this.messageQueue.queueMessage({ content: message, allowedMentions: { repliedUser: !!replyTo } }, targetChannel, replyTo)
                isFirst = false
            }
        } else {
            const replyTo = originalMessage
            return this.messageQueue.queueMessage({ ...response, allowedMentions: { repliedUser: !!replyTo, parse: [] } }, targetChannel, replyTo)
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
                }
                else {
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

        await this.state.addMessages([{ role: 'user', content }])
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
        await this.state.addMessages([{ role: 'user', content }])
    }

    public async clearHistory(): Promise<void> {
        const prompt = this.state.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.state.clear(prompt)
    }

    public async updateSystemPrompt(): Promise<void> {
        const prompt = this.state.testMode ? CRIMSON_CHAT_TEST_PROMPT : CRIMSON_CHAT_SYSTEM_PROMPT
        await this.state.updateSystemPrompt(prompt)
    }

    public async setModel(modelName: string): Promise<void> {
        await this.state.setModelName(modelName)
        this.emit('statusChange')
        logger.ok(`CrimsonChat model switched to: ${green(modelName)}`)
    }

    public async setHistoryLimit(mode: HistoryLimitMode, limit: number): Promise<void> {
        await this.state.setHistoryLimit(mode, limit)
        this.emit('statusChange')
    }

    public setForceNextBreakdown(force: boolean): void {
        this.forceNextBreakdown = force
        this.emit('statusChange')
        logger.ok(`Force next breakdown set to: ${yellow(force)}`)
    }

    public async toggleBerserkMode(): Promise<boolean> {
        if (this.state.testMode) return false
        await this.state.setBerserkMode(!this.state.berserkMode)
        this.emit('statusChange')
        return this.state.berserkMode
    }

    public async setTestMode(enabled: boolean): Promise<void> {
        await this.state.setTestMode(enabled)
        if (enabled && this.state.berserkMode) {
            await this.state.setBerserkMode(false)
        }
        await this.updateSystemPrompt()
        this.emit('statusChange')
        logger.ok(`Test mode set to: ${yellow(enabled)}. System prompt updated.`)
    }

    public isTestMode(): boolean {
        return this.state.testMode
    }

    public isEnabled(): boolean {
        return this.state.enabled
    }

    public async setEnabled(state: boolean): Promise<void> {
        await this.state.setEnabled(state)
        this.emit('statusChange')
        logger.info(`CrimsonChat ${green(state ? 'enabled' : 'disabled')}`)
    }

    public isIgnored(userId: string): boolean {
        return this.state.ignoredUsers.includes(userId)
    }

    public async ignoreUser(userId: string): Promise<void> {
        await this.state.addIgnoredUser(userId)
        logger.ok(`Ignored user ${yellow(userId)}`)
    }

    public async unignoreUser(userId: string): Promise<void> {
        await this.state.removeIgnoredUser(userId)
        logger.ok(`Unignored user ${yellow(userId)}`)
    }

    public getIgnoredUsers(): string[] {
        return this.state.ignoredUsers
    }

    private _getToolDefinitionsPrompt(): string {
        const tools = this.toolRegistry.tools
        if (tools.size === 0) {
            return ''
        }
        const toolDefinitions = Array.from(tools.values()).map(tool => {
            const params = tool.parameters.map(p => `    <${p.name}>${p.description}</${p.name}>`).join('\n')
            return `<tool>\n  <name>${tool.name}</name>\n  <description>${tool.description}</description>\n  <parameters>\n${params}\n  </parameters>\n</tool>`
        }).join('\n\n')

        return toolDefinitions
    }
}
