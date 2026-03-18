import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
import { red } from '../../util/colors'
const logger = new Logger('ServerConfig | DataSource')

import { DataSource } from 'typeorm'
import { ServerConfig, type PlatformType } from './entities/ServerConfig'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

@singleton()
export class ServerConfigDataSource {
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
                entities: [ServerConfig],
                synchronize: false
            })

            await this.orm.initialize()

            // Run migrations
            await this.runMigrations()

            // Synchronize schema after migrations
            await this.orm.synchronize()

            // Verify tables exist
            const tables = await this.orm.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name IN ('guild_configs')
            `)

            if (tables.length < 1) {
                logger.warn(
                    'The guild config table is missing, forcing table creation'
                )
                await this.orm.synchronize(true)
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

    /**
     * Run database migrations for multi-platform support
     */
    private async runMigrations(): Promise<void> {
        try {
            // Check if we need to migrate from old schema (guildId -> serverId, add platform)
            const tableInfo = await this.orm.query(`
                PRAGMA table_info(guild_configs)
            `)

            const hasGuildIdColumn = tableInfo.some(
                (col: { name: string }) => col.name === 'guildId'
            )
            const hasServerIdColumn = tableInfo.some(
                (col: { name: string }) => col.name === 'serverId'
            )
            const hasPlatformColumn = tableInfo.some(
                (col: { name: string }) => col.name === 'platform'
            )

            // Migration 1: Rename guildId to serverId and add platform column
            if (hasGuildIdColumn && !hasServerIdColumn) {
                logger.info(
                    'Migrating guild_configs: renaming guildId to serverId and adding platform column'
                )

                // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
                await this.orm.query('DROP TABLE IF EXISTS guild_configs_new')
                await this.orm.query(`
                    CREATE TABLE guild_configs_new (
                        serverId VARCHAR NOT NULL,
                        platform VARCHAR NOT NULL DEFAULT 'discord',
                        prefix VARCHAR DEFAULT 'c1!',
                        messageTrigger BOOLEAN DEFAULT 0,
                        tagSystemEnabled BOOLEAN DEFAULT 0,
                        tagCreateRoles TEXT DEFAULT '',
                        tagCreateUsers TEXT DEFAULT '',
                        tagCreatePermissions TEXT DEFAULT '',
                        markovBotWhitelistedChannels TEXT DEFAULT '',
                        PRIMARY KEY (serverId, platform)
                    )
                `)

                // Copy data from old table, setting platform to 'discord' for existing records
                await this.orm.query(`
                    INSERT INTO guild_configs_new (
                        serverId, platform, prefix, messageTrigger, 
                        tagSystemEnabled, tagCreateRoles, tagCreateUsers, 
                        tagCreatePermissions, markovBotWhitelistedChannels
                    )
                    SELECT 
                        guildId as serverId,
                        'discord' as platform,
                        COALESCE(prefix, 'c1') || '!' as prefix,
                        COALESCE(messageTrigger, 0) as messageTrigger,
                        COALESCE(tagSystemEnabled, 0) as tagSystemEnabled,
                        COALESCE(tagCreateRoles, '') as tagCreateRoles,
                        COALESCE(tagCreateUsers, '') as tagCreateUsers,
                        COALESCE(tagCreatePermissions, '') as tagCreatePermissions,
                        COALESCE(markovBotWhitelistedChannels, '') as markovBotWhitelistedChannels
                    FROM guild_configs
                `)

                // Drop old table and rename new one
                await this.orm.query('DROP TABLE guild_configs')
                await this.orm.query(
                    'ALTER TABLE guild_configs_new RENAME TO guild_configs'
                )

                logger.ok(
                    'Migration completed: guildId -> serverId, platform added'
                )
            }

            // Migration 2: Add platform column if it doesn't exist (for fresh installs or partial migrations)
            if (hasServerIdColumn && !hasPlatformColumn) {
                logger.info(
                    'Migrating guild_configs: adding platform column with default discord'
                )

                // Add platform column
                await this.orm.query(`
                    ALTER TABLE guild_configs ADD COLUMN platform VARCHAR DEFAULT 'discord'
                `)

                // Update existing records to have platform='discord'
                await this.orm.query(`
                    UPDATE guild_configs SET platform = 'discord' WHERE platform IS NULL
                `)

                // Update prefix to include '!' if it doesn't have it
                await this.orm.query(`
                    UPDATE guild_configs SET prefix = prefix || '!' WHERE prefix NOT LIKE '%!'
                `)

                logger.ok('Migration completed: platform column added')
            }

            // Migration 3: Ensure prefix ends with '!' for consistency
            if (hasPlatformColumn) {
                const result = await this.orm.query(`
                    SELECT COUNT(*) as count FROM guild_configs WHERE prefix NOT LIKE '%!'
                `)
                if (result[0]?.count > 0) {
                    logger.info(
                        `Migrating ${result[0].count} guild configs: updating prefix to include '!'`
                    )
                    await this.orm.query(`
                        UPDATE guild_configs SET prefix = prefix || '!' WHERE prefix NOT LIKE '%!'
                    `)
                    logger.ok('Migration completed: prefixes updated')
                }
            }
        } catch (error) {
            logger.error(
                `Migration failed: ${red(error instanceof Error ? error.message : String(error))}`
            )
            throw error
        }
    }

    /**
     * Get server config by ID and platform
     */
    public async getServerConfig(
        serverId: string,
        platform: PlatformType
    ): Promise<ServerConfig | null> {
        const config = await this.orm.getRepository(ServerConfig).findOne({
            where: { serverId, platform }
        })
        return config || null
    }

    /**
     * Set server config by ID and platform
     */
    public async setServerConfig(
        serverId: string,
        platform: PlatformType,
        config: Partial<ServerConfig>
    ): Promise<void> {
        const existingConfig = await this.getServerConfig(serverId, platform)
        if (existingConfig) {
            await this.orm
                .getRepository(ServerConfig)
                .update({ serverId, platform }, config)
        } else {
            await this.orm
                .getRepository(ServerConfig)
                .insert({ serverId, platform, ...config })
        }
    }

    /**
     * Delete server config by ID and platform
     */
    public async deleteServerConfig(
        serverId: string,
        platform: PlatformType
    ): Promise<void> {
        await this.orm
            .getRepository(ServerConfig)
            .delete({ serverId, platform })
    }

    /**
     * Get all server configs
     */
    public async getAllServerConfigs(): Promise<ServerConfig[]> {
        return this.orm.getRepository(ServerConfig).find()
    }
}
