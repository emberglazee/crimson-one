import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
import { yellow, red } from '../../util/colors'
const logger = new Logger('MarkovChain | DataSource')

import { DataSource as ORMDataSource, DeleteResult } from 'typeorm'

import { removeDuplicatesByKey } from '../../util/functions'

import { Message } from './entities/Message'
import { Channel } from './entities/Channel'
import { Guild } from './entities/Guild'
import { User } from './entities/User'
import { AddMessageIndexes1760228277158 } from '../../migrations/1760228277158-AddMarkovIndexes'
import { AddPlatformDiscriminator1760228277159 } from '../../migrations/1760228277159-AddPlatformDiscriminator'

export interface SimplifiedMessage {
    id: string
    text: string
    authorId: string
    channelId: string
    timestamp: number
}

@singleton()
export class MarkovDataSource {
    public orm!: ORMDataSource
    private initialized = false
    private migrationsRunning = false
    private migrationsCompleted = false

    public async init(timeoutMs: number = 15000) {
        if (this.initialized) return

        const initPromise = (async () => {
            logger.debug('{init} Creating ORM DataSource...')
            this.orm = new ORMDataSource({
                type: 'postgres',
                host: process.env.POSTGRES_HOST,
                port: Number(process.env.POSTGRES_PORT),
                username: process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
                database: process.env.POSTGRES_DB,
                entities: [Channel, Message, Guild, User],
                migrations: [
                    AddMessageIndexes1760228277158,
                    AddPlatformDiscriminator1760228277159
                ],
                synchronize: false,
                connectTimeoutMS: 5000
            })

            logger.debug('{init} Initializing ORM connection...')
            await this.orm.initialize()
            logger.debug('{init} ORM connection initialized')

            this.initialized = true
            logger.ok('{init} PostgreSQL database connection established')

            // Run migrations in the background without blocking initialization
            this.runMigrationsAsync()
        })()

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
                () => reject(new Error(`Database initialization timeout after ${timeoutMs}ms`)),
                timeoutMs
            )
        })

        try {
            await Promise.race([initPromise, timeoutPromise])
        } catch (error) {
            logger.error(
                `Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`
            )
            throw error
        }
    }

    private async runMigrationsAsync(): Promise<void> {
        if (this.migrationsRunning || this.migrationsCompleted) return

        this.migrationsRunning = true
        logger.info('{runMigrationsAsync} Running pending migrations in background...')

        try {
            const pendingMigrations = await this.orm.showMigrations()
            if (!pendingMigrations) {
                logger.info('{runMigrationsAsync} No pending migrations')
                this.migrationsCompleted = true
                this.migrationsRunning = false
                return
            }

            const startTime = Date.now()
            await this.orm.runMigrations()
            const duration = ((Date.now() - startTime) / 1000).toFixed(2)

            this.migrationsCompleted = true
            this.migrationsRunning = false
            logger.ok(`{runMigrationsAsync} Migrations completed in ${yellow(duration)}s`)
        } catch (error) {
            this.migrationsRunning = false
            logger.error(
                `{runMigrationsAsync} Failed to run migrations: ${red(error instanceof Error ? error.message : String(error))}`
            )
            logger.warn(
                '{runMigrationsAsync} Database operations may be slower without indexes'
            )
        }
    }

    public async addMessages(
        messages: SimplifiedMessage[],
        guildId: string,
        channelName: string,
        channelId: string,
        fullyCollectedChannelId?: string,
        forceRescan = false
    ) {
        await this.init()

        const BATCH_SIZE = 1000
        logger.debug(`{addMessages} BATCH_SIZE = ${yellow(BATCH_SIZE)}`)

        return this.orm.transaction(async manager => {
            // Upsert guild in a single operation
            await manager.upsert(Guild, { id: guildId }, ['id'])
            logger.debug(`{addMessages} Guild ${yellow(guildId)} upserted`)

            // 1. Collect all unique users and channels from the entire message set first.
            const allUsers = removeDuplicatesByKey(
                messages.map(msg => ({ id: msg.authorId })),
                user => user.id
            )
            const channelPayload = {
                id: channelId,
                guild: { id: guildId },
                name: channelName,
                fullyCollected: false
            }

            // 2. Bulk upsert all unique users ONCE.
            if (allUsers.length > 0) {
                logger.debug(
                    `{addMessages} Upserting ${yellow(allUsers.length)} unique users`
                )
                await manager
                    .createQueryBuilder()
                    .insert()
                    .into(User)
                    .values(allUsers)
                    .orIgnore()
                    .execute()
                logger.debug('{addMessages} Unique users upserted')
            }

            // 3. Bulk upsert all unique channels ONCE.
            logger.debug(
                `{addMessages} Upserting 1 unique channel: ${channelName}`
            )
            await manager
                .createQueryBuilder()
                .insert()
                .into(Channel)
                .values(channelPayload)
                .orIgnore()
                .execute()
            logger.debug('{addMessages} Unique channel upserted')

            // 4. Process messages in batches for insertion.
            logger.debug(
                '{addMessages} Beginning to process message batches for insertion'
            )
            for (let i = 0; i < messages.length; i += BATCH_SIZE) {
                const chunk = messages.slice(i, i + BATCH_SIZE)
                const messagesToInsert = chunk.map(msg => ({
                    ...msg,
                    guildId: guildId
                }))

                if (messagesToInsert.length > 0) {
                    logger.debug(
                        `{addMessages} Inserting batch of ${yellow(messagesToInsert.length)} messages`
                    )
                    // Use `orUpdate` for PostgreSQL to handle conflicts (ON CONFLICT DO UPDATE)
                    await manager
                        .createQueryBuilder()
                        .insert()
                        .into(Message)
                        .values(messagesToInsert)
                        .orUpdate(['text', 'timestamp'], ['id'])
                        .execute()
                }
            }
            logger.debug('{addMessages} All message batches inserted')

            // Mark channel as fully collected if specified
            if (fullyCollectedChannelId) {
                await manager.update(
                    Channel,
                    { id: fullyCollectedChannelId },
                    { fullyCollected: !forceRescan }
                )
                logger.debug(
                    `{addMessages} Marked channel ${yellow(fullyCollectedChannelId)} as fully collected`
                )
            }
            logger.debug('{addMessages} Finished!')
        })
    }

    public async getMessages(options: {
        guildId?: string
        channelId?: string
        user?: { id: string }
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

        if (options.global) {
            // No guild/channel filters
        } else {
            if (options.guildId) {
                query.andWhere('message.guildId = :guildId', {
                    guildId: options.guildId
                })
            }
            if (options.channelId) {
                query.andWhere('message.channelId = :channelId', {
                    channelId: options.channelId
                })
            }
        }

        if (options.user) {
            query.andWhere('message.authorId = :authorId', {
                authorId: options.user.id
            })
        } else if (options.userId) {
            query.andWhere('message.authorId = :authorId', {
                authorId: options.userId
            })
        }

        return query.getMany()
    }

    public async isChannelFullyCollected(
        guildId: string,
        channelId: string
    ): Promise<boolean> {
        await this.init()
        const channel = await this.orm.getRepository(Channel).findOne({
            where: { id: channelId, guild: { id: guildId } }
        })
        return channel?.fullyCollected ?? false
    }

    public async getExistingMessageIds(
        guildId: string,
        channelId: string
    ): Promise<Set<string>> {
        await this.init()
        const messages = await this.orm.getRepository(Message).find({
            where: { guild: { id: guildId }, channel: { id: channelId } },
            select: ['id']
        })
        return new Set(messages.map(m => m.id))
    }

    public async deleteMessages(options: {
        guildId?: string
        channelId?: string
        user?: { id: string }
        userId?: string
        global?: boolean
    }): Promise<DeleteResult> {
        await this.init()

        const query = this.orm
            .getRepository(Message)
            .createQueryBuilder('message')
            .delete()

        if (options.global) {
            // No filters for global deletion
        } else if (options.guildId) {
            query.andWhere('guildId = :guildId', { guildId: options.guildId })
            if (options.channelId) {
                query.andWhere('channelId = :channelId', {
                    channelId: options.channelId
                })
            }
        }

        if (options.user) {
            query.andWhere('authorId = :authorId', {
                authorId: options.user.id
            })
        } else if (options.userId) {
            query.andWhere('authorId = :authorId', { authorId: options.userId })
        }

        // Safety net: if no filters are applied, this would be a global delete.
        // The command logic should prevent this, but as a last resort, we check here.
        if (
            !options.global &&
            !options.guildId &&
            !options.channelId &&
            !options.user &&
            !options.userId
        ) {
            throw new Error(
                'Unfiltered delete operations are not allowed. Please specify a guild, channel, or user.'
            )
        }

        return query.execute()
    }
}
