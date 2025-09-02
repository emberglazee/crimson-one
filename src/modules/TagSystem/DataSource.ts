import { DataSource } from 'typeorm'
import { Tag } from './entities/Tag'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { Logger, red } from '../Logger'
const logger = new Logger('TagSystem | DataSource')

export class TagDataSource {
    private static instance: TagDataSource
    public orm!: DataSource
    private initialized = false
    private readonly databasePath = join(process.cwd(), 'data/tag-system.sqlite')

    private constructor() {}

    public static getInstance(): TagDataSource {
        if (!TagDataSource.instance) {
            TagDataSource.instance = new TagDataSource()
        }
        return TagDataSource.instance
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

            this.orm = new DataSource({
                type: 'sqlite',
                database: this.databasePath,
                entities: [Tag],
                synchronize: true
            })

            await this.orm.initialize()

            this.initialized = true
            logger.ok('{init} TagSystem SQLite database initialized')
        } catch (error) {
            logger.error(`Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`)
            throw error
        }
    }
}
