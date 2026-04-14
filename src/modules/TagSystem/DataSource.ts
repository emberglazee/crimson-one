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

            // Manually create table if it doesn't exist (sqlite3 v6 compatible)
            // Column order matches TypeORM's original schema
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

            // Create index if it doesn't exist (use TypeORM's original index name)
            await this.orm.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS IDX_74b5c254e1f9e4a9401ca28efb ON tags (guildId, name)
            `)

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
