import { Logger, yellow } from '../../util/logger'
const logger = Logger.new('MarkovChain | DataSource')

import { Guild as DiscordGuild, Message as DiscordMessage, TextChannel, User as DiscordUser } from 'discord.js'
import { inspect } from 'util'
import { DataSource as ORMDataSource } from 'typeorm'

import { removeDuplicatesByKey } from '../../util/functions'

import { Message } from './entities/Message'
import { Channel } from './entities/Channel'
import { Guild } from './entities/Guild'
import { User } from './entities/User'
import { Tag } from './entities/Tag'

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
            entities: [Channel, Message, Guild, User, Tag],
            synchronize: true,
            logging: false
        })

        await this.orm.initialize()
        this.initialized = true
        logger.ok('{init} SQLite database initialized')
    }

    public async addMessages(messages: DiscordMessage[], guild: DiscordGuild, fullyCollectedChannelId?: string) {
        await this.init()

        const BATCH_SIZE = 100
        logger.info(`{addMessages} BATCH_SIZE = ${yellow(BATCH_SIZE)}`)

        return this.orm.transaction(async manager => {
            // Upsert guild
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

                // Upsert users
                const usersToUpsert = removeDuplicatesByKey(
                    chunk.map(msg => ({
                        id: msg.author.id,
                        username: msg.author.username,
                        discriminator: msg.author.discriminator
                    })),
                    user => user.id
                )
                logger.info(`{addMessages} Upserting ${yellow(usersToUpsert.length)} users`)
                await manager.upsert(User, usersToUpsert, ['id'])
                logger.ok('{addMessages} Users upserted')

                // Upsert channels
                const channelsToUpsert = chunk.map(msg => ({
                    id: msg.channelId,
                    guild: { id: guild.id },
                    name: (msg.channel as TextChannel).name,
                    fullyCollected: false
                }))
                logger.info(`{addMessages} Upserting ${yellow(channelsToUpsert.length)} channels`)
                await manager.upsert(Channel, channelsToUpsert, ['id'])
                logger.ok('{addMessages} Channels upserted')

                // Insert messages
                const messagesToInsert = chunk.map(msg => ({
                    id: msg.id,
                    text: msg.content,
                    author: { id: msg.author.id },
                    channel: { id: msg.channelId },
                    guild: { id: guild.id },
                    timestamp: msg.createdTimestamp
                }))
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
                    { fullyCollected: true }
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
        global?: boolean
    }): Promise<Message[]> {
        await this.init()

        const query = this.orm
            .getRepository(Message)
            .createQueryBuilder('message')
            .leftJoinAndSelect('message.author', 'author')
            .leftJoinAndSelect('message.channel', 'channel')
            .leftJoinAndSelect('message.guild', 'guild')

        if (options.global) {
            // No additional filters for global scope
        } else if (options.guild) {
            query.where('guild.id = :guildId', { guildId: options.guild.id })
        } else if (options.channel) {
            query.where('channel.id = :channelId', { channelId: options.channel.id })
        }

        if (options.user) {
            query.andWhere('message.authorId = :authorId', { authorId: options.user.id })
        }

        logger.info(`[getMessages]\nquery: ${query.getSql()}\nparameters: ${inspect(query.getParameters(), true, Infinity, true)}`)

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
