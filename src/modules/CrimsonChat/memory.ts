import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | History')

import { promises as fs } from 'fs'
import path from 'path'
import {
    getCrimsonChatHistoryFoundation,
    CRIMSON_CHAT_SYSTEM_PROMPT,
} from '../../util/constants'
import type { AssistantContent, CoreMessage, FilePart, ImagePart, TextPart, ToolResultPart, ToolCallPart } from 'ai'
import { Buffer } from 'buffer'

export type HistoryLimitMode = 'messages' | 'tokens'

// Define a serializable representation of an image part for JSON storage
type SerializableImagePart = {
    type: 'image'
    image: string // base64 string
    mimeType?: string // mimeType is directly on the part, not nested
}
type SerializableCoreMessageContent = (
    | { type: 'text'; text: string }
    | SerializableImagePart
    | { type: 'tool-call'; toolCallId: string, toolName: string, args: unknown }
    | { type: 'tool-result'; toolCallId: string, result: unknown, toolName?: string }
    | FilePart // Added FilePart for serialization
)[]

// New type for messages that are serializable for storage
type SerializableMessage = Omit<CoreMessage, 'content'> & {
    content: string | SerializableCoreMessageContent | null;
};

// Type guard to check for our custom serializable image format
function isSerializableImagePart(part: unknown): part is SerializableImagePart {
    return (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'image' &&
        'image' in part &&
        typeof part.image === 'string' // Expecting base64 string here
    )
}

export class CrimsonFileBufferHistory {
    private historyPath = path.join(process.cwd(), 'data/chat_history.json')
    private history: CoreMessage[] = []
    private initialized = false
    private systemPrompt: string = CRIMSON_CHAT_SYSTEM_PROMPT

    private limitMode: HistoryLimitMode = 'messages'
    private messageLimit = 100
    private tokenLimit = 16384 // A reasonable default, can be changed later

    private async pruneHistory(): Promise<void> {
        if (this.limitMode === 'messages') {
            // Keep the system prompt and the foundation messages, then the last N messages.
            const foundationSize = getCrimsonChatHistoryFoundation().length
            const totalAllowed = foundationSize + this.messageLimit
            if (this.history.length > totalAllowed) {
                const excess = this.history.length - totalAllowed
                // Remove messages from after the foundation to the start of the sliding window
                this.history.splice(foundationSize, excess)
                logger.info(`Pruned message history to the last ${this.messageLimit} messages.`)
            }
        } else if (this.limitMode === 'tokens') {
            // TODO: Implement token-based pruning
            // This will require a tokenizer library compatible with Gemini.
            // For now, we'll just log a warning.
            logger.warn('Token-based history pruning is not yet implemented.')
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
        await this.pruneHistory() // Prune immediately after setting the new limit
        await this.saveHistoryToFile()
    }

    private async loadHistoryFromFile(): Promise<void> {
        if (this.initialized) return
        try {
            const data = await fs.readFile(this.historyPath, 'utf-8')
            const savedData = JSON.parse(data) as {
                systemPrompt: string,
                history: SerializableMessage[],
                limitMode?: HistoryLimitMode,
                messageLimit?: number,
                tokenLimit?: number
            }

            this.systemPrompt = savedData.systemPrompt || CRIMSON_CHAT_SYSTEM_PROMPT
            this.limitMode = savedData.limitMode || 'messages'
            this.messageLimit = savedData.messageLimit || 100
            this.tokenLimit = savedData.tokenLimit || 16384

            // Deserialize history, converting base64 images back to buffers
            this.history = savedData.history.map(msg => {
                // Create a new message object to avoid direct mutation of the mapped item
                const newMsg = { ...msg } as CoreMessage

                if (Array.isArray(newMsg.content)) {
                    // Based on the role, narrow the type of newMsg.content and map accordingly
                    switch (newMsg.role) {
                        case 'user':
                            // User content can have TextPart, ImagePart, FilePart
                            newMsg.content = (newMsg.content as SerializableCoreMessageContent).map(part => {
                                if (isSerializableImagePart(part)) {
                                    return {
                                        type: 'image',
                                        image: Buffer.from(part.image, 'base64'), // Directly use part.image (base64 string)
                                        mimeType: part.mimeType, // Directly use part.mimeType
                                    } as ImagePart
                                }
                                return part as TextPart | FilePart
                            }) as (TextPart | ImagePart | FilePart)[]
                            break
                        case 'assistant':
                            newMsg.content = (newMsg.content as SerializableCoreMessageContent)
                                .map(part => {
                                    return part as TextPart | ToolCallPart | ToolResultPart
                                }) as Exclude<AssistantContent, string>
                            break
                        case 'tool':
                            newMsg.content = (newMsg.content as SerializableCoreMessageContent).map(part => {
                                return part as ToolResultPart
                            }) as ToolResultPart[]
                            break
                        case 'system':
                            break
                    }
                }
                return newMsg
            })

            this.initialized = true
            logger.info(`Chat history loaded successfully with ${yellow(this.history.length)} messages`)
        } catch(e) {
            logger.warn(`No existing chat history found, starting fresh. Error: ${e}`)
            this.systemPrompt = CRIMSON_CHAT_SYSTEM_PROMPT
            this.history = getCrimsonChatHistoryFoundation()
            this.initialized = true
            await this.saveHistoryToFile() // Create the file on first run
        }
    }

    private async saveHistoryToFile(): Promise<void> {
        try {
            await fs.mkdir(path.dirname(this.historyPath), { recursive: true })

            // Serialize history, converting image buffers to base64
            const serializableHistory: SerializableMessage[] = this.history.map((msg: CoreMessage) => { // Explicitly type as SerializableMessage[]
                const newMsg: SerializableMessage = { ...msg } as SerializableMessage
                if (Array.isArray(newMsg.content)) {
                    newMsg.content = newMsg.content.map(p => {
                        if (p.type === 'image') {
                            // Ensure p.image is not a string and then cast to Buffer for instanceof check and toString()
                            if (typeof p.image !== 'string') {
                                const imageBuffer = p.image as Buffer // Explicitly cast to Buffer
                                if (imageBuffer instanceof Buffer) { // Now this should be valid
                                    const serializablePart: SerializableImagePart = {
                                        type: 'image',
                                        image: imageBuffer.toString('base64'), // Use imageBuffer
                                        mimeType: p.mimeType ?? 'image/png',
                                    }
                                    return serializablePart
                                }
                            }
                        }
                        return p
                    }) as SerializableCoreMessageContent
                }
                return newMsg
            })

            const dataToSave = {
                systemPrompt: this.systemPrompt,
                history: serializableHistory,
                limitMode: this.limitMode,
                messageLimit: this.messageLimit,
                tokenLimit: this.tokenLimit
            }

            await fs.writeFile(this.historyPath, JSON.stringify(dataToSave, null, 2))
        } catch (e) {
            logger.error(`Failed to save chat history: ${red((e as Error).message)}`)
        }
    }

    async getHistory(): Promise<{history: CoreMessage[], systemInstruction: string}> {
        await this.loadHistoryFromFile()
        return {
            history: this.history,
            systemInstruction: this.systemPrompt
        }
    }

    async addMessages(messages: CoreMessage[]): Promise<void> {
        await this.loadHistoryFromFile()
        this.history.push(...messages)
        await this.pruneHistory()
        await this.saveHistoryToFile()
    }

    async clear(systemPrompt: string = CRIMSON_CHAT_SYSTEM_PROMPT): Promise<void> {
        this.systemPrompt = systemPrompt
        this.history = getCrimsonChatHistoryFoundation()
        await this.saveHistoryToFile()
        logger.ok('Chat history cleared and file reset.')
    }

    async updateSystemPrompt(newPrompt: string): Promise<void> {
        await this.loadHistoryFromFile()
        this.systemPrompt = newPrompt
        await this.saveHistoryToFile()
        logger.ok(`System prompt updated.`)
    }
}
