import { Client, Guild, Message as DiscordMessage, TextChannel, User } from 'discord.js'
import { ChainBuilder } from './entities'
import { DataSource } from './DataSource'
import { Logger } from '../../util/logger'
import chalk from 'chalk'

const logger = Logger.new('MarkovChain.Chat')

interface MarkovGenerateOptions {
    guild?: Guild
    channel?: TextChannel
    user?: User
    words?: number
    seed?: string
    global?: boolean
}

export class MarkovChat {
    private static instance: MarkovChat
    private client: Client | null = null
    private dataSource = DataSource.getInstance()

    private constructor() {}

    public static getInstance(): MarkovChat {
        if (!MarkovChat.instance) {
            MarkovChat.instance = new MarkovChat()
        }
        return MarkovChat.instance
    }

    public setClient(client: Client) {
        this.client = client
    }

    public async collectMessages(channel: TextChannel, options: {
        user?: User
        limit?: number
        delayMs?: number
    } = {}) {
        if (!this.client) throw new Error('Client not set')

        const { user, limit = 1000, delayMs = 1000 } = options
        const messages: DiscordMessage[] = []

        let lastId: string | undefined
        let batchCount = 0

        while (messages.length < limit) {
            if (batchCount > 0) {
                logger.info(`Waiting ${chalk.yellow(delayMs)}ms before next batch...`)
                await Bun.sleep(delayMs)
            }

            const fetchOptions: { limit: number; before?: string } = {
                limit: Math.min(100, limit - messages.length)
            }
            if (lastId) fetchOptions.before = lastId

            logger.ok(`Fetching batch #${chalk.yellow(batchCount + 1)} (${chalk.yellow(fetchOptions.limit)} messages)`)
            const batch = await channel.messages.fetch(fetchOptions)
            if (!batch.size) break

            const validMessages = user
                ? batch.filter(msg => msg.author.id === user.id && msg.content.length > 0)
                : batch.filter(msg => msg.content.length > 0)

            messages.push(...validMessages.values())
            lastId = batch.last()?.id
            batchCount++
        }

        if (messages.length > 0) {
            await this.dataSource.addMessages(messages, channel.guild)
            logger.ok(`Collected ${chalk.yellow(messages.length)} messages from ${chalk.yellow(channel.name)}`)
        }

        return messages.length
    }

    public async generateMessage(options: MarkovGenerateOptions): Promise<string> {
        const chain = new ChainBuilder()
        const messages = await this.dataSource.getMessages({
            guild: options.guild,
            channel: options.channel,
            user: options.user,
            global: options.global
        })

        if (messages.length === 0) {
            throw new Error('No messages found with the given filters')
        }

        for (const msg of messages) {
            chain.train(msg.content)
        }

        return chain.generate({
            minWords: Math.max(3, Math.floor((options.words || 20) * 0.8)),
            maxWords: options.words || 20,
            seed: options.seed?.split(/\s+/)
        })
    }
}
