import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
import { red } from '../../util/colors'
const logger = new Logger('TagSystem | DataSource')

import { DataSource } from 'typeorm'
import { Tag } from './entities/Tag'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

@singleton()
export class TagDataSource {
    public orm!: DataSource
    private initialized = false
    private readonly databasePath = join(
        process.cwd(),
        'data/tag-system.sqlite'
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
                entities: [Tag],
                synchronize: false
            })

            await this.orm.initialize()

            // Check if we need to migrate from old schema (serverId -> guildId)
            const tableInfo = await this.orm.query('PRAGMA table_info(tags)')
            const hasServerId = tableInfo.some(
                (col: { name: string }) => col.name === 'serverId'
            )
            const hasGuildId = tableInfo.some(
                (col: { name: string }) => col.name === 'guildId'
            )

            if (hasServerId && !hasGuildId) {
                logger.info(
                    'Migrating tags table from old schema (serverId -> guildId)'
                )

                // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
                await this.orm.query(`
                    CREATE TABLE tags_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        name VARCHAR NOT NULL,
                        content TEXT NOT NULL,
                        ownerId VARCHAR NOT NULL,
                        createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
                        guildId VARCHAR NOT NULL
                    )
                `)

                // Copy data from old table (serverId -> guildId, drop platform)
                await this.orm.query(`
                    INSERT INTO tags_new (id, name, content, ownerId, createdAt, guildId)
                    SELECT id, name, content, ownerId, createdAt, serverId FROM tags
                `)

                // Drop old table and rename new one
                await this.orm.query('DROP TABLE tags')
                await this.orm.query('ALTER TABLE tags_new RENAME TO tags')

                // Create new index
                await this.orm.query(`
                    CREATE UNIQUE INDEX IDX_74b5c254e1f9e4a9401ca28efb ON tags (guildId, name)
                `)

                logger.ok('Migration completed successfully')
            } else if (!hasGuildId) {
                // Fresh install - create table
                await this.orm.query(`
                    CREATE TABLE IF NOT EXISTS tags (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        name VARCHAR NOT NULL,
                        content TEXT NOT NULL,
                        ownerId VARCHAR NOT NULL,
                        createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
                        guildId VARCHAR NOT NULL
                    )
                `)

                // Create index if it doesn't exist
                await this.orm.query(`
                    CREATE UNIQUE INDEX IF NOT EXISTS IDX_74b5c254e1f9e4a9401ca28efb ON tags (guildId, name)
                `)
            }

            this.initialized = true
            logger.ok('{init} TagSystem SQLite database initialized')
        } catch (error) {
            logger.error(
                `Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`
            )
            throw error
        }
    }
}
