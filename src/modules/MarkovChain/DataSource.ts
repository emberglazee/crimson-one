import { Guild, Message as DiscordMessage, TextChannel, User } from 'discord.js'
import { DataSource as ORMDataSource } from 'typeorm'
import { Logger } from '../../util/logger'
import chalk from 'chalk'
import { Message } from './entities/Message'
import { Channel } from './entities/Channel'
import { Guild as ChainGuild } from './entities/Guild'
import { User as ChainUser } from './entities/User'
import { Tag } from './entities'

const logger = Logger.new('MarkovChain.DataSource')

export class DataSource {
    private static instance: DataSource
    private orm!: ORMDataSource
    private initialized = false

    private constructor() {}

    public static getInstance(): DataSource {
        if (!DataSource.instance) {
            DataSource.instance = new DataSource()
        }
        return DataSource.instance
    }

    public async init() {
        if (this.initialized) return

        this.orm = new ORMDataSource({
            type: 'sqlite',
            database: 'data/markov.sqlite',
            entities: [Channel, Message, ChainGuild, ChainUser, Tag, User],
            synchronize: true,
            logging: false
        })

        await this.orm.initialize()
        this.initialized = true
        logger.ok('SQLite database initialized')
    }

    public async addMessages(messages: DiscordMessage[], guild: Guild, fullyCollectedChannelId?: string) {
        await this.init()

        return this.orm.transaction(async manager => {
            // Upsert guild
            await manager.upsert(ChainGuild, {
                id: guild.id
            }, ['id'])

            // Process messages in chunks of 500
            for (let i = 0; i < messages.length; i += 500) {
                const chunk = messages.slice(i, i + 500)

                // Upsert users first
                await manager.upsert(
                    ChainUser,
                    chunk.map(msg => ({
                        id: msg.author.id,
                        username: msg.author.username,
                        discriminator: msg.author.discriminator
                    })),
                    ['id']
                )

                // Upsert channels
                await manager.upsert(
                    Channel,
                    chunk.map(msg => ({
                        id: msg.channelId,
                        guildId: guild.id,
                        name: (msg.channel as TextChannel).name,
                        fullyCollected: false
                    })),
                    ['id']
                )

                // Insert messages
                await manager.insert(
                    Message,
                    chunk.map(msg => ({
                        id: msg.id,
                        text: msg.content,
                        authorId: msg.author.id,
                        channelId: msg.channelId,
                        guildId: guild.id,
                        timestamp: msg.createdTimestamp
                    }))
                )
            }

            // Mark channel as fully collected if specified
            if (fullyCollectedChannelId) {
                await manager.update(Channel,
                    { id: fullyCollectedChannelId },
                    { fullyCollected: true }
                )
                logger.ok(`Marked channel ${chalk.yellow(fullyCollectedChannelId)} as fully collected`)
            }
        })
    }

    public async getMessages(options: {
        guild?: Guild
        channel?: TextChannel
        user?: User
        global?: boolean
    }): Promise<Message[]> {
        await this.init()

        const query = this.orm
        .getRepository(Message)
        .createQueryBuilder('message')
        .leftJoinAndSelect('message.author', 'author')
        .leftJoinAndSelect('message.channel', 'channel')

        if (options.global) {
            // No additional filters for global scope
        } else if (options.guild) {
            query.where('message.guildId = :guildId', { guildId: options.guild.id })
        } else if (options.channel) {
            query.where('message.channelId = :channelId', { channelId: options.channel.id })
        }

        if (options.user) {
            query.andWhere('message.authorId = :authorId', { authorId: options.user.id })
        }

        return query.getMany()
    }

    public async isChannelFullyCollected(guildId: string, channelId: string): Promise<boolean> {
        await this.init()
        const channel = await this.orm.getRepository(Channel).findOne({
            where: { id: channelId, guild: { id: guildId } }
        })
        return channel?.fullyCollected ?? false
    }

    public async getExistingMessageIds(guildId: string, channelId: string): Promise<Set<string>> {
        await this.init()
        const messages = await this.orm.getRepository(Message).find({
            where: { guild: { id: guildId }, channel: { id: channelId } },
            select: ['id']
        })
        return new Set(messages.map(m => m.id))
    }
}
