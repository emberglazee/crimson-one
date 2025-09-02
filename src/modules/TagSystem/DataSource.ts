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
    private readonly databasePath = join(process.cwd(), 'data/tag-system.sqlite')

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
