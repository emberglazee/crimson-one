import { GuildConfigDataSource } from './DataSource'
import { EventEmitter } from 'tseep'
import { GuildConfig } from './entities/GuildConfig'
import { Logger } from '../../util/logger'
import type { GuildId } from '../../types/types' // cosmetic type for clarity

const logger = new Logger('GuildConfigManager')

export default class GuildConfigManager extends EventEmitter<{
    configUpdate: (guildId: GuildId, config: GuildConfig) => void
}> {
    private static instance: GuildConfigManager
    private dataSource = GuildConfigDataSource.getInstance()
    private configCache: Map<GuildId, GuildConfig> = new Map()
    private constructor() {
        super()
    }

    public static getInstance(): GuildConfigManager {
        if (!this.instance) {
            this.instance = new GuildConfigManager()
        }
        return this.instance
    }

    public async init() {
        await this.dataSource.init()
        logger.ok('Data source initialized')
    }

    public async getConfig(guildId: GuildId): Promise<GuildConfig> {
        if (this.configCache.has(guildId)) {
            return this.configCache.get(guildId)! // assert non-null because .has()
        }

        let config = await this.dataSource.getGuildConfig(guildId)
        if (!config) {
            config = new GuildConfig()
            config.guildId = guildId
        }

        const defaultGuildConfig = new GuildConfig()
        for (const key of Object.keys(defaultGuildConfig)) {
            const propKey = key as keyof GuildConfig
            if (config[propKey] === undefined || config[propKey] === null) {
                // @ts-expect-error ts(2322) - this is a db migration measure
                config[propKey] = defaultGuildConfig[propKey]
            }
        }

        this.configCache.set(guildId, config)
        return config
    }

    public async setConfig(guildId: GuildId, config: Partial<GuildConfig>): Promise<void> {
        await this.dataSource.setGuildConfig(guildId, config)
        const updatedConfig = await this.getConfig(guildId)
        this.emit('configUpdate', guildId, updatedConfig)
    }

    public async deleteConfig(guildId: GuildId): Promise<void> {
        await this.dataSource.deleteGuildConfig(guildId)
        this.configCache.delete(guildId)
    }
}
