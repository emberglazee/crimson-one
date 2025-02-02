import type { Client, TextChannel, ChatInputCommandInteraction, CommandInteractionOption, CacheType, Message } from 'discord.js'
import OpenAI from 'openai'
import { CRIMSON_BREAKDOWN_PROMPT, CRIMSON_CHAT_SYSTEM_PROMPT } from '../util/constants'
import type { ChatCompletionMessage } from 'openai/resources/index.mjs'
import { promises as fs } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import os from 'os'
import { Logger } from '../util/logger'
const logger = new Logger('CrimsonChat')

export default class CrimsonChat {
    private static instance: CrimsonChat
    private openai: OpenAI
    private threadId = '1333319963737325570'
    private thread: TextChannel | null = null
    private client: Client | null = null
    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private isProcessing: boolean = false
    private enabled: boolean = true
    private bannedUsers: Set<string> = new Set()
    private bannedUsersPath = path.join(process.cwd(), 'data/banned_users.json')
    private readonly BREAKDOWN_CHANCE = 0.01
    private forceNextBreakdown: boolean = false
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

    private async loadBannedUsers(): Promise<void> {
        try {
            const data = await fs.readFile(this.bannedUsersPath, 'utf-8')
            this.bannedUsers = new Set(JSON.parse(data))
        } catch (error) {
            this.bannedUsers = new Set()
        }
    }

    private async saveBannedUsers(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.bannedUsersPath), { recursive: true })
            await fs.writeFile(this.bannedUsersPath, JSON.stringify([...this.bannedUsers]))
        } catch (error) {
            console.error('Failed to save banned users:', error)
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
        await this.loadBannedUsers()
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
        imageAttachments?: string[]
    }, originalMessage?: Message) {
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
            // Check for breakdown first
            const breakdown = await this.handleRandomBreakdown()
            if (breakdown) {
                // If breakdown occurs, only send that and return
                await this.sendResponseToDiscord(breakdown, undefined, originalMessage)
                return
            }

            // Extract image URLs from message content and combine with image attachments
            const imageUrls = new Set<string>() // Use Set to automatically deduplicate URLs
            
            // Add provided image attachments
            if (options.imageAttachments?.length) {
                options.imageAttachments.forEach(url => imageUrls.add(url))
            }

            // Add any image URLs from the message content
            const urlRegex = /https?:\/\/\S+?(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?(?=\s|$)/gi
            const contentImageUrls = content.match(urlRegex) || []
            contentImageUrls.forEach(url => imageUrls.add(url))

            const formattedMessage = await this.formatUserMessage(
                options.username,
                options.displayName,
                options.serverDisplayName,
                content,
                options.respondingTo
            )

            const messageForCompletion = await this.parseMessagesForChatCompletion(
                formattedMessage, 
                Array.from(imageUrls) // Convert Set back to array
            )

            // Only store text content in history, with a note about images if present
            const historyContent = formattedMessage + (imageUrls.size ? 
                `\n[Message included ${imageUrls.size} image${imageUrls.size > 1 ? 's' : ''}]` : '')

            this.appendMessage('user', historyContent)

            this.trimHistory()

            let hasMoreCommands = true

            while (hasMoreCommands) {
                logger.info('Sending request to OpenAI...')
                let response;
                try {
                    response = await this.openai.chat.completions.create({
                        messages: [
                            ...this.prepareHistory().slice(0, -1), // All messages except the last one
                            messageForCompletion // Use the formatted message with images
                        ],
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
                        await originalMessage?.reply('...')
                        this.isProcessing = false
                        return
                    }

                    // Always keep the original message in history
                    this.appendMessage('assistant', message.content || '')

                    if (!hadCommands) {
                        logger.info('No more commands to process, sending final response')
                        await this.sendResponseToDiscord(parsedResponse, message, originalMessage)
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

            // Updated regex to match entire command with parameters
            const commandRegex = /!(fetchRoles|fetchUser|getRichPresence|ignore|getEmojis)(?:\(([^)]+)\))?/g
            const commands = Array.from(content.matchAll(commandRegex))

            if (!commands.length) return { content, hadCommands: false }

            logger.info(`Found ${commands.length} commands in response`)

            // Process each command and replace it in the message
            let modifiedContent = content
            for (const [fullMatch, command, params] of commands) {
                logger.info(`Processing command: ${fullMatch} (params: ${params || 'none'})`)
                try {
                    // Pass the full command match for parsing
                    const response = await this.parseCommand(fullMatch)
                    if (response === null) return { content: null, hadCommands: true }
                    modifiedContent = modifiedContent.replace(fullMatch, `${fullMatch} -> ${response}`)
                } catch (cmdError: any) {
                    logger.error(`Error processing command ${fullMatch}: ${cmdError.message}`)
                    modifiedContent = modifiedContent.replace(fullMatch, `${fullMatch} -> Error: ${cmdError.message}`)
                }
            }

            return { content: modifiedContent, hadCommands: true }
        } catch (error: any) {
            logger.error(`Error in parseAssistantReply: ${error.message}`)
            throw error
        }
    }

    private async sendResponseToDiscord(content: string, message?: ChatCompletionMessage, originalMessage?: any): Promise<void> {
        if (!this.thread) throw new Error('Thread not set')

        try {
            let finalContent = content

            // If content is over 2000 characters, send as a file
            if (finalContent.length > 2000) {
                const buffer = Buffer.from(finalContent, 'utf-8')
                const messageOptions = {
                    files: [{
                        attachment: buffer,
                        name: 'response.txt'
                    }]
                }

                if (originalMessage?.reply) {
                    await originalMessage.reply(messageOptions).catch((err: Error) => {
                        logger.error(`Failed to send file response: ${err.message}`)
                        throw new Error('Failed to send file response')
                    })
                } else {
                    await this.thread.send(messageOptions).catch((err: Error) => {
                        logger.error(`Failed to send file response: ${err.message}`)
                        throw new Error('Failed to send file response')
                    })
                }
            } else {
                if (originalMessage?.reply) {
                    await originalMessage.reply(finalContent).catch((err: Error) => {
                        logger.error(`Failed to send message: ${err.message}`)
                        throw new Error('Failed to send message')
                    })
                } else {
                    await this.thread.send(finalContent).catch((err: Error) => {
                        logger.error(`Failed to send message: ${err.message}`)
                        throw new Error('Failed to send message')
                    })
                }
            }
        } catch (error: any) {
            logger.error(`Error sending response to Discord: ${error.message}`)
            throw error
        }
    }

    private async parseCommand(text: string): Promise<string | null> {
        text = text.normalize('NFKC')
        logger.info(`Normalized text before regex: ${text}`)

        const commandRegex = /!(fetchRoles|fetchUser|getRichPresence|ignore|getEmojis)(?:\(([^)]+)\))?/
        const match = commandRegex.exec(text)
        if (!match) {
            logger.error(`No command match found in text: ${text}`)
            return null
        }

        const [fullMatch, command, params] = match
        let finalUsername = params?.trim() || ''

        // Move afterCommand declaration here so it's available to all cases
        const afterCommand = text.slice(match.index + fullMatch.length).trim()
        logger.info(`Command: ${command}, Initial Username: ${finalUsername}`)
        logger.info(`Content after command: ${afterCommand}`)

        // Only try to extract username from after command if no params found
        if (!finalUsername && afterCommand) {
            finalUsername = afterCommand.split(/\s+/)[0]
            logger.info(`Found username after command: ${finalUsername}`)
        }

        logger.info(`Executing command ${command} with final username: ${finalUsername}`)

        switch (command) {
            case 'fetchRoles':
                if (!finalUsername) return 'Error: Username or ID required for fetchRoles'
                const member = await this.thread?.guild?.members.fetch(finalUsername)
                    .catch(() => this.thread?.guild?.members.cache.find(m => m.user.username === finalUsername))
                if (!member) return `Could not find user: ${finalUsername}`
                return member.roles.cache.map(role => role.name).join(', ')

            case 'fetchUser':
                if (!finalUsername) return 'Error: Username or ID required for fetchUser'
                const user = await this.client?.users.fetch(finalUsername)
                    .catch(() => this.client?.users.cache.find(u => u.username === finalUsername))
                if (!user) return `Could not find user: ${finalUsername}`
                return JSON.stringify({
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    createdAt: user.createdAt,
                    bot: user.bot
                }, null, 2)

            case 'getRichPresence':
                if (!finalUsername) return 'Error: Username or ID required for getRichPresence'
                try {
                    logger.info(`Fetching member for rich presence: ${finalUsername}`)
                    const presenceMember = await this.thread?.guild?.members.fetch(finalUsername)
                        .catch(() => this.thread?.guild?.members.cache.find(m => m.user.username === finalUsername))

                    if (!presenceMember) return `Could not find user: ${finalUsername}`

                    // Force fetch the presence
                    await presenceMember.fetch(true)
                    const presence = presenceMember.presence

                    logger.info(`Presence data for ${finalUsername}: ${JSON.stringify(presence)}`)

                    if (!presence) {
                        return 'User is offline or has no presence data'
                    }

                    if (!presence.activities || presence.activities.length === 0) {
                        return 'User has presence data but no current activities'
                    }

                    // Format activities in a more readable way
                    const activities = presence.activities.map(activity => ({
                        name: activity.name,
                        type: activity.type,
                        state: activity.state,
                        details: activity.details,
                        createdAt: activity.createdAt
                    }))

                    return JSON.stringify(activities, null, 2)
                } catch (error) {
                    logger.error(`Error fetching rich presence: ${error}`)
                    return `Error fetching presence data: ${error instanceof Error ? error.message : 'Unknown error'}`
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
                return `Unknown command: !${command}`
        }
    }

    private async extractFirstFrameFromGif(url: string): Promise<Buffer | null> {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gif-frame-'))
        const outputPath = path.join(tmpDir, 'frame.png')
        const gifPath = path.join(tmpDir, 'temp.gif')

        try {
            // Download GIF to temp file
            const response = await fetch(url)
            if (!response.ok) throw new Error(`Failed to fetch GIF: ${response.statusText}`)

            const buffer = Buffer.from(await response.arrayBuffer())
            await fs.writeFile(gifPath, buffer)

            // Verify the file exists before running FFmpeg
            const stats = await fs.stat(gifPath)
            if (stats.size === 0) throw new Error('Downloaded GIF is empty')

            logger.info(`Downloaded GIF to ${gifPath} (${stats.size} bytes)`)

            // Extract first frame using FFmpeg
            return new Promise((resolve, reject) => {
                let stderr = ''
                const ffmpeg = spawn('ffmpeg', [
                    '-y', // Overwrite output file
                    '-loglevel', 'info', // More verbose logging
                    '-i', gifPath,
                    '-vframes', '1',
                    '-vf', 'scale=-1:-1', // Maintain aspect ratio
                    '-f', 'image2',
                    outputPath
                ])

                ffmpeg.stderr.on('data', data => {
                    stderr += data.toString()
                    logger.info(`FFmpeg: ${data.toString().trim()}`)
                })

                ffmpeg.on('close', async (code) => {
                    if (code === 0) {
                        try {
                            const frameBuffer = await fs.readFile(outputPath)
                            if (frameBuffer.length === 0) {
                                reject(new Error('Generated frame is empty'))
                                return
                            }
                            resolve(frameBuffer)
                        } catch (error) {
                            reject(new Error(`Failed to read output file: ${error}`))
                        }
                    } else {
                        reject(new Error(`FFmpeg exited with code ${code}:\n${stderr}`))
                    }
                })

                ffmpeg.on('error', error => {
                    logger.error(`FFmpeg spawn error: ${error}`)
                    reject(error)
                })
            })
        } catch (error) {
            logger.error(`Failed to extract first frame: ${error}`)
            return null
        } finally {
            // Cleanup temp directory
            try {
                await fs.rm(tmpDir, { recursive: true, force: true })
                logger.info(`Cleaned up temp directory: ${tmpDir}`)
            } catch (error) {
                logger.error(`Failed to cleanup temp directory: ${error}`)
            }
        }
    }

    private async fetchAndConvertToBase64(url: string): Promise<string | null> {
        try {
            logger.info(`Fetching image from URL: ${url}`)
            let buffer: Buffer

            // Use an URL object to check if path ends with '.gif' without removing query params
            const urlObj = new URL(url)
            const isGif = urlObj.pathname.toLowerCase().endsWith('.gif')

            if (isGif) {
                logger.info('GIF detected, extracting first frame...')
                const frameBuffer = await this.extractFirstFrameFromGif(url)
                if (!frameBuffer) {
                    throw new Error('Failed to extract first frame from GIF')
                }
                buffer = frameBuffer
            } else {
                const response = await fetch(url)
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
                buffer = Buffer.from(await response.arrayBuffer())
            }

            const base64 = buffer.toString('base64')
            const mimeType = isGif ? 'image/png' : 'image/jpeg'
            return `data:${mimeType};base64,${base64}`
        } catch (error) {
            logger.error(`Failed to fetch and convert image: ${error}`)
            return null
        }
    }

    private cleanImageUrl(url: string): string {
        try {
            // Update regex to be more precise and handle query parameters better
            const re = /^(https?:\/\/[^\s]+?\.(?:gif|png|jpe?g|webp))(?:\?[^"'\s]*)?$/i
            const match = url.match(re)
            if (match) {
                return match[1]
            }
            return url
        } catch (error) {
            logger.error(`Failed to clean image URL: ${error}`)
            return url
        }
    }

    private normalizeUrl(url: string): string {
        try {
            const urlObj = new URL(url)
            return urlObj.protocol + '//' + urlObj.host + urlObj.pathname
        } catch {
            return url
        }
    }

    private async parseMessagesForChatCompletion(content: string, attachments: string[] = []): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
        if (!attachments.length) {
            logger.info('Creating message with text only')
            return { role: 'user', content: content }
        }

        logger.info(`Creating message with text and ${attachments.length} images`)
        const messageContent: Array<OpenAI.Chat.Completions.ChatCompletionContentPart> = [
            { type: 'text', text: content || '' }
        ]

        // Use Set for tracking processed URLs
        const processedUrls = new Set<string>()

        // Process each attachment
        for (const attachmentUrl of attachments) {
            const cleanUrl = this.cleanImageUrl(attachmentUrl)
            const normalizedUrl = this.normalizeUrl(cleanUrl)
            
            // Log URL status
            logger.info(`Processing image URL: ${cleanUrl}`)
            
            // Only process each unique URL once
            if (!processedUrls.has(normalizedUrl)) {
                processedUrls.add(normalizedUrl)
                
                const base64Image = await this.fetchAndConvertToBase64(cleanUrl)
                if (base64Image) {
                    logger.info('Successfully converted image to base64')
                    messageContent.push({
                        type: 'image_url',
                        image_url: { url: base64Image }
                    })
                } else {
                    logger.warn(`Failed to process image: ${cleanUrl}`)
                }
            } else {
                logger.info(`Skipping duplicate URL (already processed): ${cleanUrl}`)
            }
        }

        return { role: 'user', content: messageContent }
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

        // Keep the system prompt (first message) and only trim subsequent messages
        while (historyTokens > 128000 && this.history.length > 2) {
            // Remove the second element (index 1), keeping the system prompt at index 0
            this.history.splice(1, 1)
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

    private async getUserPresenceAndRoles(userId: string) {
        if (!this.thread?.guild) return null
        
        try {
            const member = await this.thread.guild.members.fetch(userId)
            if (!member) return null

            // Force fetch presence
            await member.fetch(true)
            const presence = member.presence

            const roles = member.roles.cache.map(role => role.name)
            const activities = presence?.activities?.map(activity => ({
                name: activity.name,
                type: activity.type,
                state: activity.state,
                details: activity.details,
                createdAt: activity.createdAt
            })) || []

            return {
                roles,
                presence: activities.length ? activities : 'offline or no activities'
            }
        } catch (error) {
            logger.error(`Error fetching user presence/roles: ${error}`)
            return null
        }
    }

    private async formatUserMessage(username: string, displayName: string, serverDisplayName: string, text: string, respondingTo?: { targetUsername: string; targetText: string }, attachments?: string[]) {
        const parsedText = await this.parseMentions(text)
        const userId = this.client?.users.cache.find(u => u.username === username)?.id
        const userInfo = userId ? await this.getUserPresenceAndRoles(userId) : null

        return JSON.stringify({
            username,
            displayName,
            serverDisplayName,
            currentTime: new Date().toISOString(),
            text: parsedText,
            attachments,
            respondingTo,
            userStatus: userInfo || 'unknown'
        })
    }

    public isBanned(userId: string): boolean {
        return this.bannedUsers.has(userId)
    }

    public async banUser(userId: string): Promise<void> {
        this.bannedUsers.add(userId)
        await this.saveBannedUsers()
        logger.info(`Banned user ${userId} from CrimsonChat`)
    }

    public async unbanUser(userId: string): Promise<void> {
        this.bannedUsers.delete(userId)
        await this.saveBannedUsers()
        logger.info(`Unbanned user ${userId} from CrimsonChat`)
    }

    public async handleStartup(): Promise<void> {
        if (!this.thread) return

        const bootMessage = await this.thread.messages.fetch({ limit: 1 })
        const lastMessage = bootMessage.first()

        if (lastMessage?.content.includes('Crimson is shutting down...')) {
            const formattedMessage = await this.formatUserMessage(
                'System',
                'System',
                'System',
                'I am back online after a restart.'
            )

            this.appendMessage('user', formattedMessage)
            await this.sendMessage('You\'re back online, Crimson 1.', {
                username: 'System',
                displayName: 'System',
                serverDisplayName: 'System'
            })
        }
    }

    public async handleShutdown(): Promise<void> {
        if (!this.thread) return

        // Send shutdown message without triggering a response
        await this.thread.send('Crimson is shutting down...')
    }

    private async handleRandomBreakdown(): Promise<string | null> {
        if (this.forceNextBreakdown || Math.random() < this.BREAKDOWN_CHANCE) {
            logger.info(`Triggering ${this.forceNextBreakdown ? 'forced' : 'random'} Crimson 1 breakdown`)
            this.forceNextBreakdown = false // Reset the flag after use
            const response = await this.openai.chat.completions.create({
                messages: [{
                    role: 'system',
                    content: CRIMSON_BREAKDOWN_PROMPT
                }],
                model: 'gpt-4o-mini'
            })

            const breakdown = response.choices[0].message?.content
            if (breakdown) {
                this.appendMessage('assistant', breakdown)
                return breakdown
            }
        }
        return null
    }

    public setForceNextBreakdown(force: boolean): void {
        this.forceNextBreakdown = force
        logger.info(`Force next breakdown set to: ${force}`)
    }
}
