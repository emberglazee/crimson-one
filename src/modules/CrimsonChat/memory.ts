import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | State')

import { promises as fs } from 'fs'
import path from 'path'
import {
    getCrimsonChatHistoryFoundation,
    CRIMSON_CHAT_SYSTEM_PROMPT,
    DEFAULT_GEMINI_MODEL
} from '../../util/constants'
import type { CoreMessage, FilePart, ImagePart, TextPart, ToolResultPart, ToolCallPart } from 'ai'
import { Buffer } from 'buffer'

export type HistoryLimitMode = 'messages' | 'tokens'

// Define a serializable representation of an image part for JSON storage
type SerializableImagePart = {
    type: 'image'
    image: string // base64 string
    mimeType?: string
}
type SerializableCoreMessageContent = (
    | { type: 'text'; text: string }
    | SerializableImagePart
    | { type: 'tool-call'; toolCallId: string, toolName: string, args: unknown }
    | { type: 'tool-result'; toolCallId: string, result: unknown, toolName?: string }
    | FilePart
)[]

// Type for messages stored in the JSON file
type StoredMessage = Omit<CoreMessage, 'content'> & {
    content: string | SerializableCoreMessageContent | null;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
};

// Type for in-memory messages, which are CoreMessages with optional usage data
type MessageWithUsage = CoreMessage & {
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
};

// Type guard to check for our custom serializable image format
function isSerializableImagePart(part: unknown): part is SerializableImagePart {
    return (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'image' &&
        'image' in part &&
        typeof part.image === 'string'
    )
}

export class CrimsonChatState {
    private statePath = path.join(process.cwd(), 'data/crimsonchat_state.json')
    public history: MessageWithUsage[] = []
    private initialized = false

    public systemPrompt: string = CRIMSON_CHAT_SYSTEM_PROMPT
    public limitMode: HistoryLimitMode = 'messages'
    public messageLimit = 100
    public tokenLimit = 32768
    public currentTokenCount = 0
    public enabled = true
    public modelName: string = DEFAULT_GEMINI_MODEL
    public berserkMode = false
    public testMode = false
    public ignoredUsers: string[] = []

    private async updateTotalTokenCount(): Promise<void> {
        if (this.limitMode !== 'tokens') {
            this.currentTokenCount = 0
            return
        }

        this.currentTokenCount = this.history.reduce((acc, msg) => {
            if (msg.usage) {
                // The promptTokens are for the whole history up to that point, so we only add the completionTokens for an accurate rolling count.
                // The user prompt part is implicitly included in the *next* message's promptTokens.
                // A better approximation is to sum completion tokens and estimate user message tokens.
                const userMsgContent = Array.isArray(msg.content) ? msg.content.find(p => p.type === 'text') as TextPart : { text: msg.content as string }
                const userTokens = Math.ceil((userMsgContent?.text?.length || 0) / 4)
                return acc + (msg.usage.completionTokens || 0) + userTokens
            }

            // Fallback for messages without usage data (e.g. older history or user messages)
            const content = Array.isArray(msg.content)
                ? msg.content.map(p => (p.type === 'text' ? p.text : '')).join(' ')
                : msg.content
            return acc + Math.ceil((content || '').length / 4)
        }, 0)
        logger.info(`Recalculated total tokens: ${yellow(this.currentTokenCount)}`)
    }

    private async pruneHistory(): Promise<void> {
        if (this.limitMode === 'messages') {
            const foundationSize = getCrimsonChatHistoryFoundation().length
            const totalAllowed = foundationSize + this.messageLimit
            if (this.history.length > totalAllowed) {
                const excess = this.history.length - totalAllowed
                this.history.splice(foundationSize, excess)
                logger.info(`Pruned message history to the last ${this.messageLimit} messages.`)
            }
        } else if (this.limitMode === 'tokens') {
            const foundationSize = getCrimsonChatHistoryFoundation().length
            await this.updateTotalTokenCount()

            while (this.currentTokenCount > this.tokenLimit && this.history.length > foundationSize) {
                const removedMessage = this.history.splice(foundationSize, 1)[0]
                if (removedMessage.usage) {
                    const userMsgContent = Array.isArray(removedMessage.content) ? removedMessage.content.find(p => p.type === 'text') as TextPart : { text: removedMessage.content as string }
                    const userTokens = Math.ceil((userMsgContent?.text?.length || 0) / 4)
                    this.currentTokenCount -= (removedMessage.usage.completionTokens || 0) + userTokens
                } else {
                    const content = Array.isArray(removedMessage.content)
                        ? removedMessage.content.map(p => (p.type === 'text' ? p.text : '')).join(' ')
                        : removedMessage.content
                    this.currentTokenCount -= Math.ceil((content || '').length / 4)
                }
            }
            logger.info(`Pruned history to ~${yellow(this.currentTokenCount)} tokens.`)
        }
    }

    public async setHistoryLimit(mode: HistoryLimitMode, limit: number): Promise<void> {
        this.limitMode = mode
        if (mode === 'messages') {
            this.messageLimit = limit
        } else {
            this.tokenLimit = limit
        }
        logger.ok(`History limit set to ${limit} ${mode}.`)
        await this.pruneHistory()
        await this.saveStateToFile()
    }

    public async loadStateFromFile(): Promise<void> {
        if (this.initialized) return
        try {
            const data = await fs.readFile(this.statePath, 'utf-8')
            const savedData = JSON.parse(data) as {
                systemPrompt: string,
                history: StoredMessage[],
                limitMode?: HistoryLimitMode,
                messageLimit?: number,
                tokenLimit?: number
                enabled?: boolean,
                modelName?: string,
                berserkMode?: boolean,
                testMode?: boolean,
                ignoredUsers?: string[]
            }

            this.systemPrompt = savedData.systemPrompt || CRIMSON_CHAT_SYSTEM_PROMPT
            this.limitMode = savedData.limitMode || 'messages'
            this.messageLimit = savedData.messageLimit || 100
            this.tokenLimit = savedData.tokenLimit || 30000
            this.enabled = savedData.enabled ?? true
            this.modelName = savedData.modelName || DEFAULT_GEMINI_MODEL
            this.berserkMode = savedData.berserkMode ?? false
            this.testMode = savedData.testMode ?? false
            this.ignoredUsers = savedData.ignoredUsers || []

            this.history = savedData.history.map((msg): MessageWithUsage => {
                const { role, content: storedContent, ...rest } = msg
                const loadedContent = storedContent ?? ''

                switch (role) {
                    case 'system':
                        return { role, content: loadedContent as string, ...rest }
                    case 'user': {
                        const content = Array.isArray(loadedContent)
                            ? (loadedContent as SerializableCoreMessageContent).map(part => {
                                if (isSerializableImagePart(part)) {
                                    return {
                                        type: 'image',
                                        image: Buffer.from(part.image, 'base64'),
                                        mimeType: part.mimeType,
                                    } as ImagePart
                                }
                                return part as TextPart | FilePart
                            })
                            : loadedContent
                        return { role, content, ...rest }
                    }
                    case 'assistant': {
                        const content = Array.isArray(loadedContent)
                            ? (loadedContent as SerializableCoreMessageContent).filter(
                                (p): p is TextPart | ToolCallPart => p.type === 'text' || p.type === 'tool-call',
                            ) as (TextPart | ToolCallPart)[]
                            : loadedContent
                        return { role, content, ...rest }
                    }
                    case 'tool': {
                        const content = Array.isArray(loadedContent)
                            ? (loadedContent as SerializableCoreMessageContent).filter(
                                (p): p is ToolResultPart => p.type === 'tool-result',
                            ) as ToolResultPart[]
                            : []
                        return { role, content, ...rest }
                    }
                }
            })

            await this.updateTotalTokenCount()
            this.initialized = true
            logger.info(`CrimsonChat state loaded successfully with ${yellow(this.history.length)} messages and ~${yellow(this.currentTokenCount)} tokens.`)
        } catch (e) {
            logger.warn(`No existing state file found, starting fresh. Error: ${e}`)
            this.systemPrompt = CRIMSON_CHAT_SYSTEM_PROMPT
            this.history = getCrimsonChatHistoryFoundation()
            this.initialized = true
            await this.saveStateToFile()
        }
    }

    public async saveStateToFile(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.statePath), { recursive: true })

            const serializableHistory: StoredMessage[] = this.history.map((msg: MessageWithUsage) => {
                const { content, ...rest } = msg
                const newMsg: StoredMessage = { ...rest, content: null }

                if (typeof content === 'string') {
                    newMsg.content = content
                } else if (Array.isArray(content)) {
                    newMsg.content = content.map(p => {
                        if (p.type === 'image') {
                            if (Buffer.isBuffer(p.image)) {
                                return {
                                    type: 'image',
                                    image: p.image.toString('base64'),
                                    mimeType: p.mimeType ?? 'image/png',
                                }
                            }
                            if (p.image instanceof ArrayBuffer) {
                                return {
                                    type: 'image',
                                    image: Buffer.from(p.image).toString('base64'),
                                    mimeType: p.mimeType ?? 'image/png',
                                }
                            }
                            if (typeof p.image === 'string') {
                                return {
                                    type: 'image',
                                    image: p.image,
                                    mimeType: p.mimeType,
                                }
                            }
                            return null
                        }
                        return p
                    }).filter((p): p is NonNullable<typeof p> => p !== null) as SerializableCoreMessageContent
                }
                return newMsg
            })

            const dataToSave = {
                systemPrompt: this.systemPrompt,
                history: serializableHistory,
                limitMode: this.limitMode,
                messageLimit: this.messageLimit,
                tokenLimit: this.tokenLimit,
                enabled: this.enabled,
                modelName: this.modelName,
                berserkMode: this.berserkMode,
                testMode: this.testMode,
                ignoredUsers: this.ignoredUsers,
            }

            await fs.writeFile(this.statePath, JSON.stringify(dataToSave, null, 2))
        } catch (e) {
            logger.error(`Failed to save chat state: ${red((e as Error).message)}`)
        }
    }

    async getState(): Promise<CrimsonChatState> {
        await this.loadStateFromFile()
        return this
    }

    async addMessages(messages: CoreMessage[], usage?: { promptTokens: number; completionTokens: number }): Promise<void> {
        await this.loadStateFromFile()

        const messagesWithUsage: MessageWithUsage[] = messages.map((msg, index) => {
            const msgWithUsage: MessageWithUsage = msg
            if (index === messages.length - 1 && usage) {
                msgWithUsage.usage = {
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                }
            }
            return msgWithUsage
        })

        this.history.push(...messagesWithUsage)

        if (usage) {
            this.currentTokenCount += usage.promptTokens + usage.completionTokens
        } else {
            this.currentTokenCount += messages.reduce((acc, msg) => {
                const content = Array.isArray(msg.content)
                    ? msg.content.map(p => (p.type === 'text' ? p.text : '')).join(' ')
                    : msg.content
                return acc + Math.ceil((content || '').length / 4)
            }, 0)
        }

        await this.pruneHistory()
        await this.saveStateToFile()
    }

    async clear(systemPrompt: string = CRIMSON_CHAT_SYSTEM_PROMPT): Promise<void> {
        this.systemPrompt = systemPrompt
        this.history = getCrimsonChatHistoryFoundation()
        await this.saveStateToFile()
        logger.ok('Chat history cleared and file reset.')
    }

    async updateSystemPrompt(newPrompt: string): Promise<void> {
        await this.loadStateFromFile()
        this.systemPrompt = newPrompt
        await this.saveStateToFile()
        logger.ok(`System prompt updated.`)
    }

    public async setEnabled(enabled: boolean): Promise<void> {
        this.enabled = enabled
        await this.saveStateToFile()
    }

    public async setModelName(modelName: string): Promise<void> {
        this.modelName = modelName
        await this.saveStateToFile()
    }

    public async setBerserkMode(berserkMode: boolean): Promise<void> {
        this.berserkMode = berserkMode
        await this.saveStateToFile()
    }

    public async setTestMode(testMode: boolean): Promise<void> {
        this.testMode = testMode
        await this.saveStateToFile()
    }

    public async addIgnoredUser(userId: string): Promise<void> {
        if (!this.ignoredUsers.includes(userId)) {
            this.ignoredUsers.push(userId)
            await this.saveStateToFile()
        }
    }

    public async removeIgnoredUser(userId: string): Promise<void> {
        const index = this.ignoredUsers.indexOf(userId)
        if (index > -1) {
            this.ignoredUsers.splice(index, 1)
            await this.saveStateToFile()
        }
    }
}
