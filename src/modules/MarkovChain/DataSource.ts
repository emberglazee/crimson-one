import { Logger, yellow } from '../../util/logger'
const logger = new Logger('MarkovChain | DataSource')

import { Guild as DiscordGuild, Message as DiscordMessage, TextChannel, User as DiscordUser } from 'discord.js'
import { DataSource as ORMDataSource } from 'typeorm'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

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
    private readonly databasePath = join(process.cwd(), 'data/markov.sqlite')

    private constructor() {}

    public static getInstance(): MarkovDataSource {
        if (!MarkovDataSource.instance) {
            MarkovDataSource.instance = new MarkovDataSource()
        }
        return MarkovDataSource.instance
    }

    private ensureDataDirectory() {
        const dataDir = join(process.cwd(), 'data')
        if (!existsSync(dataDir)) {
            logger.info('Creating data directory')
            mkdirSync(dataDir, { recursive: true })
        }
    }

    public async init() {
        if (this.initialized) return

        try {
            this.ensureDataDirectory()

            this.orm = new ORMDataSource({
                type: 'sqlite',
                database: this.databasePath,
                entities: [Channel, Message, Guild, User, Tag],
                synchronize: true
            })

            await this.orm.initialize()

            // Verify tables exist
            const tables = await this.orm.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name IN ('messages', 'channels', 'guilds', 'users', 'tags')
            `)

            if (tables.length < 5) {
                logger.warn('Some tables are missing, forcing table creation')
                await this.orm.synchronize(true)
            }

            // Create indexes for better query performance
            await this.orm.query(`
                CREATE INDEX IF NOT EXISTS idx_messages_id ON messages(id);
                CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channelId);
                CREATE INDEX IF NOT EXISTS idx_messages_guild_id ON messages(guildId);
                CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(authorId);
                CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
                CREATE INDEX IF NOT EXISTS idx_channels_id ON channels(id);
                CREATE INDEX IF NOT EXISTS idx_guilds_id ON guilds(id);
                CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
            `)

            // Run migration to add new columns if needed
            await this.migrateMessageColumns()

            this.initialized = true
            logger.ok('{init} SQLite database initialized')
        } catch (error) {
            logger.error(`Failed to initialize database: ${error}`)
            throw error
        }
    }

    private async migrateMessageColumns() {
        try {
            // Check if columns exist
            const columns = await this.orm.query(`
                PRAGMA table_info(messages)
            `)

            const hasAuthorId = columns.some((col: { name: string }) => col.name === 'authorId')
            const hasChannelId = columns.some((col: { name: string }) => col.name === 'channelId')
            const hasGuildId = columns.some((col: { name: string }) => col.name === 'guildId')

            if (!hasAuthorId || !hasChannelId || !hasGuildId) {
                logger.info('Running message table migration...')

                // Add new columns if they don't exist
                if (!hasAuthorId) {
                    await this.orm.query(`
                        ALTER TABLE messages ADD COLUMN authorId TEXT
                    `)
                }
                if (!hasChannelId) {
                    await this.orm.query(`
                        ALTER TABLE messages ADD COLUMN channelId TEXT
                    `)
                }
                if (!hasGuildId) {
                    await this.orm.query(`
                        ALTER TABLE messages ADD COLUMN guildId TEXT
                    `)
                }

                // Update the new columns with data from relations
                await this.orm.query(`
                    UPDATE messages 
                    SET authorId = (
                        SELECT author.id 
                        FROM users author 
                        WHERE author.id = messages.authorId
                    ),
                    channelId = (
                        SELECT channel.id 
                        FROM channels channel 
                        WHERE channel.id = messages.channelId
                    ),
                    guildId = (
                        SELECT guild.id 
                        FROM guilds guild 
                        WHERE guild.id = messages.guildId
                    )
                `)

                logger.ok('Message table migration completed')
            }
        } catch (error) {
            logger.error(`Failed to migrate message columns: ${error}`)
            throw error
        }
    }

    public async addMessages(messages: DiscordMessage[], guild: DiscordGuild, fullyCollectedChannelId?: string, forceRescan = false) {
        await this.init()

        const BATCH_SIZE = 1000
        logger.info(`{addMessages} BATCH_SIZE = ${yellow(BATCH_SIZE)}`)

        return this.orm.transaction(async manager => {
            // Upsert guild in a single operation
            await manager.upsert(Guild, {
                id: guild.id
            }, ['id'])
            logger.ok(`{addMessages} Guild ${yellow(guild.id)} upserted`)

            // Process in batches
            logger.info('{addMessages} Beginning to process batches')
            for (let i = 0; i < messages.length; i += BATCH_SIZE) {
                logger.info(`{addMessages} Processing batch ${yellow(i)}`)
                const chunk = messages.slice(i, i + BATCH_SIZE)
                logger.info(`{addMessages} Chunk size: ${yellow(chunk.length)}`)

                // Bulk upsert users
                const usersToUpsert = removeDuplicatesByKey(
                    chunk.map(msg => ({
                        id: msg.author.id
                    })),
                    user => user.id
                )
                logger.info(`{addMessages} Upserting ${yellow(usersToUpsert.length)} users`)
                await manager
                    .createQueryBuilder()
                    .insert()
                    .into(User)
                    .values(usersToUpsert)
                    .orUpdate(['id'], ['id'])
                    .execute()
                logger.ok('{addMessages} Users upserted')

                // Bulk upsert channels
                const channelsToUpsert = removeDuplicatesByKey(
                    chunk.map(msg => ({
                        id: msg.channelId,
                        guild: { id: guild.id },
                        name: (msg.channel as TextChannel).name,
                        fullyCollected: false
                    })),
                    channel => channel.id
                )
                logger.info(`{addMessages} Upserting ${yellow(channelsToUpsert.length)} channels`)
                await manager
                    .createQueryBuilder()
                    .insert()
                    .into(Channel)
                    .values(channelsToUpsert)
                    .orUpdate(['fullyCollected'], ['id'])
                    .execute()
                logger.ok('{addMessages} Channels upserted')

                // Bulk insert messages with conflict handling
                const messagesToInsert = removeDuplicatesByKey(
                    chunk.map(msg => ({
                        id: msg.id,
                        text: msg.content,
                        authorId: msg.author.id,
                        channelId: msg.channelId,
                        guildId: guild.id,
                        author: { id: msg.author.id },
                        channel: { id: msg.channelId },
                        guild: { id: guild.id },
                        timestamp: msg.createdTimestamp
                    })),
                    message => message.id
                )
                logger.info(`{addMessages} Executing custom insert query for ${yellow(messagesToInsert.length)} messages`)
                await manager
                    .createQueryBuilder()
                    .insert()
                    .into(Message)
                    .values(messagesToInsert)
                    .orUpdate(['text', 'timestamp'], ['id'])
                    .execute()
                logger.ok('{addMessages} Messages inserted, batch processed')
            }

            // Mark channel as fully collected if specified
            if (fullyCollectedChannelId) {
                await manager.update(
                    Channel,
                    { id: fullyCollectedChannelId },
                    { fullyCollected: !forceRescan }
                )
                logger.ok(`{addMessages} Marked channel ${yellow(fullyCollectedChannelId)} as fully collected`)
            }
            logger.ok('{addMessages} Finished!')
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
            // No additional filters for global scope
        } else if (options.guild) {
            query.where('message.guildId = :guildId', { guildId: options.guild.id })
        } else if (options.channel) {
            query.where('message.channelId = :channelId', { channelId: options.channel.id })
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
