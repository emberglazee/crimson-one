import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('MarkovChain | DataSource')

import { Guild as DiscordGuild, Message as DiscordMessage, TextChannel, User as DiscordUser } from 'discord.js'
import { DataSource as ORMDataSource } from 'typeorm'

import { removeDuplicatesByKey } from '../../util/functions'

import { Message } from './entities/Message'
import { Channel } from './entities/Channel'
import { Guild } from './entities/Guild'
import { User } from './entities/User'
import { Tag } from './entities/Tag'

export class MarkovDataSource {
    private static instance: MarkovDataSource
    private orm!: ORMDataSource
    private initialized = false

    private constructor() {}

    public static getInstance(): MarkovDataSource {
        if (!MarkovDataSource.instance) {
            MarkovDataSource.instance = new MarkovDataSource()
        }
        return MarkovDataSource.instance
    }

    public async init() {
        if (this.initialized) return

        try {
            this.orm = new ORMDataSource({
                type: 'postgres',
                host: process.env.POSTGRES_HOST,
                port: Number(process.env.POSTGRES_PORT),
                username: process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
                database: process.env.POSTGRES_DB,
                entities: [Channel, Message, Guild, User, Tag],
                synchronize: true // Note: For production, consider using migrations instead.
            })

            await this.orm.initialize()
            this.initialized = true
            logger.ok('{init} PostgreSQL database initialized')
        } catch (error) {
            logger.error(`Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`)
            throw error
        }
    }

    public async addMessages(messages: DiscordMessage[], guild: DiscordGuild, fullyCollectedChannelId?: string, forceRescan = false) {
        await this.init()

        const BATCH_SIZE = 1000
        logger.debug(`{addMessages} BATCH_SIZE = ${yellow(BATCH_SIZE)}`)

        return this.orm.transaction(async manager => {
            // Upsert guild in a single operation
            await manager.upsert(Guild, { id: guild.id }, ['id'])
            logger.debug(`{addMessages} Guild ${yellow(guild.id)} upserted`)

            // 1. Collect all unique users and channels from the entire message set first.
            const allUsers = removeDuplicatesByKey(messages.map(msg => ({ id: msg.author.id })), user => user.id)
            const allChannels = removeDuplicatesByKey(messages.map(msg => ({
                id: msg.channelId,
                guild: { id: guild.id },
                name: (msg.channel as TextChannel).name,
                fullyCollected: false
            })), channel => channel.id)

            // 2. Bulk upsert all unique users ONCE.
            if (allUsers.length > 0) {
                logger.debug(`{addMessages} Upserting ${yellow(allUsers.length)} unique users`)
                await manager.createQueryBuilder().insert().into(User).values(allUsers).orIgnore().execute()
                logger.debug('{addMessages} Unique users upserted')
            }

            // 3. Bulk upsert all unique channels ONCE.
            if (allChannels.length > 0) {
                logger.debug(`{addMessages} Upserting ${yellow(allChannels.length)} unique channels`)
                await manager.createQueryBuilder().insert().into(Channel).values(allChannels).orIgnore().execute()
                logger.debug('{addMessages} Unique channels upserted')
            }

            // 4. Process messages in batches for insertion.
            logger.debug('{addMessages} Beginning to process message batches for insertion')
            for (let i = 0; i < messages.length; i += BATCH_SIZE) {
                const chunk = messages.slice(i, i + BATCH_SIZE)
                const messagesToInsert = chunk.map(msg => ({
                    id: msg.id,
                    text: msg.content,
                    authorId: msg.author.id,
                    channelId: msg.channelId,
                    guildId: guild.id,
                    timestamp: msg.createdTimestamp
                }))

                if (messagesToInsert.length > 0) {
                    logger.debug(`{addMessages} Inserting batch of ${yellow(messagesToInsert.length)} messages`)
                    // Use `orUpdate` for PostgreSQL to handle conflicts (ON CONFLICT DO UPDATE)
                    await manager.createQueryBuilder().insert().into(Message).values(messagesToInsert).orUpdate(['text', 'timestamp'], ['id']).execute()
                }
            }
            logger.debug('{addMessages} All message batches inserted')

            // Mark channel as fully collected if specified
            if (fullyCollectedChannelId) {
                await manager.update(Channel, { id: fullyCollectedChannelId }, { fullyCollected: !forceRescan })
                logger.debug(`{addMessages} Marked channel ${yellow(fullyCollectedChannelId)} as fully collected`)
            }
            logger.debug('{addMessages} Finished!')
        })
    }

    public async getMessages(options: {
        guild?: DiscordGuild
        channel?: TextChannel
        user?: DiscordUser
        userId?: string
        global?: boolean
    }): Promise<Message[]> {
        await this.init()

        const query = this.orm
            .getRepository(Message)
            .createQueryBuilder('message')
            .select([
                'message.id',
                'message.text',
                'message.timestamp',
                'message.authorId',
                'message.channelId',
                'message.guildId'
            ])
            .orderBy('message.timestamp', 'DESC')

        if (options.global) {
            // No guild/channel filters
        } else {
            if (options.guild) {
                query.andWhere('message.guildId = :guildId', { guildId: options.guild.id })
            }
            if (options.channel) {
                query.andWhere('message.channelId = :channelId', { channelId: options.channel.id })
            }
        }

        if (options.user) {
            query.andWhere('message.authorId = :authorId', { authorId: options.user.id })
        } else if (options.userId) {
            query.andWhere('message.authorId = :authorId', { authorId: options.userId })
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
