import { DataSource } from 'typeorm'
import { GuildConfig } from './entities/GuildConfig'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { Logger, red } from '../../util/logger'
const logger = new Logger('GuildConfig | DataSource')

// export const guildConfigDataSource = new DataSource({
//     type: 'sqlite',
//     database: join(process.cwd(), 'data/guild-config.sqlite'),
//     entities: [GuildConfig],
//     synchronize: true
// })

export class GuildConfigDataSource {
    private static instance: GuildConfigDataSource
    private orm!: DataSource
    private initialized = false
    private readonly databasePath = join(process.cwd(), 'data/guild-config.sqlite')

    private constructor() {}

    public static getInstance(): GuildConfigDataSource {
        if (!GuildConfigDataSource.instance) {
            GuildConfigDataSource.instance = new GuildConfigDataSource()
        }
        return GuildConfigDataSource.instance
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
                entities: [GuildConfig],
                synchronize: true
            })

            await this.orm.initialize()

            // Verify tables exist
            const tables = await this.orm.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name IN ('guild_configs')
            `)

            if (tables.length < 1) {
                logger.warn('Guild config table missing, forcing table creation')
                await this.orm.synchronize(true)
            }

            this.initialized = true
            logger.ok('{init} SQLite database initialized')
        } catch (error) {
            logger.error(`Failed to initialize database: ${red(error instanceof Error ? error.message : String(error))}`)
            throw error
        }
    }

    public async getGuildConfig(guildId: string): Promise<GuildConfig | null> {
        const config = await this.orm.getRepository(GuildConfig).findOne({ where: { guildId } })
        return config || null
    }

    public async setGuildConfig(guildId: string, config: Partial<GuildConfig>): Promise<void> {
        const existingConfig = await this.getGuildConfig(guildId)
        if (existingConfig) {
            await this.orm.getRepository(GuildConfig).update({ guildId }, config)
        } else {
            await this.orm.getRepository(GuildConfig).insert({ guildId, ...config })
        }
    }

    public async deleteGuildConfig(guildId: string): Promise<void> {
        await this.orm.getRepository(GuildConfig).delete({ guildId })
    }

    public async getAllGuildConfigs(): Promise<GuildConfig[]> {
        return this.orm.getRepository(GuildConfig).find()
    }
}
