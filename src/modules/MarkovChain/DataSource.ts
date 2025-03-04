import { Guild, Message, TextChannel, User } from 'discord.js'
import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { Logger } from '../../util/logger'
import chalk from 'chalk'

const logger = Logger.new('MarkovChain.DataSource')

interface MessageData {
    content: string
    authorId: string
    channelId: string
    guildId: string
    timestamp: number
    id: string // Message ID
}

interface ChainData {
    messages: MessageData[]
    lastUpdated: number
    fullyCollectedChannels: string[] // Array of channel IDs that are fully collected
}

export class DataSource {
    private static instance: DataSource
    private dataDir = join(process.cwd(), 'data', 'markov')
    private loaded = false
    private data: Map<string, ChainData> = new Map()

    private constructor() {}

    public static getInstance(): DataSource {
        if (!DataSource.instance) {
            DataSource.instance = new DataSource()
        }
        return DataSource.instance
    }

    public async init() {
        if (this.loaded) return
        if (!existsSync(this.dataDir)) {
            await mkdir(this.dataDir, { recursive: true })
        }
        this.loaded = true
    }

    private getGuildKey(guildId: string) {
        return join(this.dataDir, `${guildId}.json`)
    }

    public async addMessages(messages: Message[], guild: Guild, fullyCollectedChannelId?: string) {
        await this.init()
        const guildKey = this.getGuildKey(guild.id)
        let data = this.data.get(guild.id) ?? { 
            messages: [], 
            lastUpdated: Date.now(),
            fullyCollectedChannels: []
        }

        const newMessages: MessageData[] = messages.map(msg => ({
            content: msg.content,
            authorId: msg.author.id,
            channelId: msg.channelId,
            guildId: msg.guildId!,
            timestamp: msg.createdTimestamp,
            id: msg.id
        }))

        data.messages.push(...newMessages)
        data.lastUpdated = Date.now()
        
        // If the channel is fully collected, add it to the list if not already there
        if (fullyCollectedChannelId && !data.fullyCollectedChannels.includes(fullyCollectedChannelId)) {
            data.fullyCollectedChannels.push(fullyCollectedChannelId)
            logger.ok(`Marked channel ${chalk.yellow(fullyCollectedChannelId)} as fully collected`)
        }
        
        this.data.set(guild.id, data)

        await writeFile(guildKey, JSON.stringify(data, null, 2))
        logger.ok(`Added ${chalk.yellow(newMessages.length)} messages to ${chalk.yellow(guild.name)}`)
    }

    public async getMessages(options: {
        guild?: Guild
        channel?: TextChannel
        user?: User
        global?: boolean
    }): Promise<MessageData[]> {
        await this.init()
        let allMessages: MessageData[] = []

        if (options.global) {
            // Combine all guild data for global scope
            for (const [_, data] of this.data) {
                allMessages.push(...data.messages)
            }
        } else if (options.guild) {
            // Load guild data if not in memory
            if (!this.data.has(options.guild.id)) {
                const guildKey = this.getGuildKey(options.guild.id)
                if (existsSync(guildKey)) {
                    const fileData = JSON.parse(await readFile(guildKey, 'utf-8')) as ChainData
                    // Ensure compatibility with older data format that might not have fullyCollectedChannels
                    if (!fileData.fullyCollectedChannels) {
                        fileData.fullyCollectedChannels = []
                    }
                    this.data.set(options.guild.id, fileData)
                    allMessages = fileData.messages
                }
            } else {
                allMessages = this.data.get(options.guild.id)!.messages
            }
        } else if (options.channel) {
            // When only channel is specified, load its guild data
            const guildId = options.channel.guildId
            // Load guild data if not in memory
            if (!this.data.has(guildId)) {
                const guildKey = this.getGuildKey(guildId)
                if (existsSync(guildKey)) {
                    const fileData = JSON.parse(await readFile(guildKey, 'utf-8')) as ChainData
                    // Ensure compatibility with older data format that might not have fullyCollectedChannels
                    if (!fileData.fullyCollectedChannels) {
                        fileData.fullyCollectedChannels = []
                    }
                    this.data.set(guildId, fileData)
                    allMessages = fileData.messages
                }
            } else {
                allMessages = this.data.get(guildId)!.messages
            }
        }

        // Apply filters
        if (options.channel) {
            allMessages = allMessages.filter(m => m.channelId === options.channel!.id)
        }
        if (options.user) {
            allMessages = allMessages.filter(m => m.authorId === options.user!.id)
        }

        return allMessages
    }
    
    public isChannelFullyCollected(guildId: string, channelId: string): boolean {
        const data = this.data.get(guildId)
        if (!data || !data.fullyCollectedChannels) return false
        return data.fullyCollectedChannels.includes(channelId)
    }

    public messageExists(guildId: string, messageId: string): boolean {
        const data = this.data.get(guildId)
        if (!data) return false
        return data.messages.some(message => message.id === messageId)
    }

    public getExistingMessageIds(guildId: string, channelId: string): Set<string> {
        const data = this.data.get(guildId)
        if (!data) return new Set<string>()
        
        const messageIds = new Set<string>()
        data.messages
            .filter(msg => msg.channelId === channelId)
            .forEach(msg => messageIds.add(msg.id))
        
        return messageIds
    }
}
