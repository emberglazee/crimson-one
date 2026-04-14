import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
import { red } from '../../util/colors'
const logger = new Logger('GuildConfig | DataSource')

import { DataSource } from 'typeorm'
import { GuildConfig } from './entities/GuildConfig'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

@singleton()
export class GuildConfigDataSource {
    public orm!: DataSource
    private initialized = false
    private readonly databasePath = join(
        process.cwd(),
        'data/guild-config.sqlite'
    )

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

            this.orm = new DataSource({
                type: 'sqlite',
                database: this.databasePath,
                entities: [GuildConfig],
                synchronize: false
            })

            await this.orm.initialize()

            // Check if we need to migrate from old schema (serverId -> guildId)
            const tableInfo = await this.orm.query(
                'PRAGMA table_info(guild_configs)'
            )
            const hasServerId = tableInfo.some(
                (col: { name: string }) => col.name === 'serverId'
            )
            const hasGuildId = tableInfo.some(
                (col: { name: string }) => col.name === 'guildId'
            )

            if (hasServerId && !hasGuildId) {
                logger.info(
                    'Migrating guild_configs table from old schema (serverId -> guildId)'
                )

                // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
                await this.orm.query(`
                    CREATE TABLE guild_configs_new (
                        prefix VARCHAR NOT NULL DEFAULT ('c1'),
                        messageTrigger BOOLEAN NOT NULL DEFAULT (0),
                        tagSystemEnabled BOOLEAN NOT NULL DEFAULT (0),
                        tagCreateRoles TEXT NOT NULL DEFAULT (''),
                        tagCreateUsers TEXT NOT NULL DEFAULT (''),
                        tagCreatePermissions TEXT NOT NULL DEFAULT (''),
                        markovBotWhitelistedChannels TEXT NOT NULL DEFAULT (''),
                        guildId VARCHAR PRIMARY KEY NOT NULL
                    )
                `)

                // Copy data from old table (serverId -> guildId, drop platform)
                // Only copy discord platform entries
                await this.orm.query(`
                    INSERT INTO guild_configs_new (prefix, messageTrigger, tagSystemEnabled, tagCreateRoles, tagCreateUsers, tagCreatePermissions, markovBotWhitelistedChannels, guildId)
                    SELECT prefix, messageTrigger, tagSystemEnabled, tagCreateRoles, tagCreateUsers, tagCreatePermissions, markovBotWhitelistedChannels, serverId 
                    FROM guild_configs 
                    WHERE platform = 'discord'
                `)

                // Drop old table and rename new one
                await this.orm.query('DROP TABLE guild_configs')
                await this.orm.query(
                    'ALTER TABLE guild_configs_new RENAME TO guild_configs'
                )

                logger.ok('Migration completed successfully')
            } else if (!hasGuildId) {
                // Fresh install - create table
                await this.orm.query(`
                    CREATE TABLE IF NOT EXISTS guild_configs (
                        prefix VARCHAR NOT NULL DEFAULT ('c1'),
                        messageTrigger BOOLEAN NOT NULL DEFAULT (0),
                        tagSystemEnabled BOOLEAN NOT NULL DEFAULT (0),
                        tagCreateRoles TEXT NOT NULL DEFAULT (''),
                        tagCreateUsers TEXT NOT NULL DEFAULT (''),
                        tagCreatePermissions TEXT NOT NULL DEFAULT (''),
                        markovBotWhitelistedChannels TEXT NOT NULL DEFAULT (''),
                        guildId VARCHAR PRIMARY KEY NOT NULL
                    )
                `)
            }

            this.initialized = true
            logger.ok('{init} SQLite database initialized')
        } catch (error) {
            logger.error(
                `Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`
            )
            throw error
        }
    }

    public async getGuildConfig(guildId: string): Promise<GuildConfig | null> {
        const config = await this.orm
            .getRepository(GuildConfig)
            .findOne({ where: { guildId } })
        return config || null
    }

    public async setGuildConfig(
        guildId: string,
        config: Partial<GuildConfig>
    ): Promise<void> {
        const existingConfig = await this.getGuildConfig(guildId)
        if (existingConfig) {
            await this.orm
                .getRepository(GuildConfig)
                .update({ guildId }, config)
        } else {
            await this.orm
                .getRepository(GuildConfig)
                .insert({ guildId, ...config })
        }
    }

    public async deleteGuildConfig(guildId: string): Promise<void> {
        await this.orm.getRepository(GuildConfig).delete({ guildId })
    }

    public async getAllGuildConfigs(): Promise<GuildConfig[]> {
        return this.orm.getRepository(GuildConfig).find()
    }
}
