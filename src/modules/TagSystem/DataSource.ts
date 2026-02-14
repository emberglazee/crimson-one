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
        'data/tag-system.sqlite',
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
                synchronize: false,
            })

            await this.orm.initialize()

            // Run migrations
            await this.runMigrations()

            await this.orm.synchronize()

            this.initialized = true
            logger.ok('{init} TagSystem SQLite database initialized')
        } catch (error) {
            logger.error(
                `Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`,
            )
            throw error
        }
    }

    private async runMigrations() {
        try {
            const tableInfo = await this.orm.query('PRAGMA table_info(tags)')
            const hasGuildId = tableInfo.some((c: any) => c.name === 'guildId')
            const hasServerId = tableInfo.some(
                (c: any) => c.name === 'serverId',
            )

            const hasPlatform = tableInfo.some(
                (c: any) => c.name === 'platform',
            )

            if (hasGuildId && !hasServerId) {
                logger.info('Migrating tags table: guildId -> serverId')
                await this.orm.query(
                    'ALTER TABLE tags RENAME COLUMN guildId TO serverId',
                )
                logger.ok('Migration completed: guildId -> serverId')
            }

            if (!hasPlatform) {
                logger.info('Migrating tags table: adding platform column')
                await this.orm.query(
                    "ALTER TABLE tags ADD COLUMN platform VARCHAR DEFAULT 'discord'",
                )
                // Ensure existing rows are set to 'discord'
                await this.orm.query(
                    "UPDATE tags SET platform = 'discord' WHERE platform IS NULL",
                )
                logger.ok('Migration completed: platform added')
            }
        } catch (error) {
            logger.error(
                `Migration failed: ${red(error instanceof Error ? error.message : String(error))}`,
            )
        }
    }
}
