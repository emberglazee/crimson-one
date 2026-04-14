import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
import { red } from '../../util/colors'
const logger = new Logger('LongTermMemory | DataSource')

import { DataSource } from 'typeorm'
import { Memory } from './entities/Memory'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

@singleton()
export class LongTermMemoryDataSource {
    public orm!: DataSource
    private initialized = false
    private readonly databasePath = join(
        process.cwd(),
        'data/long-term-memory.sqlite'
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
                entities: [Memory],
                synchronize: false
            })

            await this.orm.initialize()

            // Manually create table if it doesn't exist (sqlite3 v6 compatible)
            // Column order matches TypeORM's original schema
            await this.orm.query(`
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    text TEXT NOT NULL,
                    importance INTEGER NOT NULL,
                    createdAt DATETIME NOT NULL DEFAULT (datetime('now'))
                )
            `)

            this.initialized = true
            logger.ok('{init} LongTermMemory SQLite database initialized')
        } catch (error) {
            logger.error(
                `Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`
            )
            throw error
        }
    }
}
