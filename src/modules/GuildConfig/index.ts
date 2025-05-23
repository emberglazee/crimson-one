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

    public async getConfig(guildId?: GuildId): Promise<GuildConfig> {
        if (!guildId) {
            logger.debug('{getConfig} No guildId, returning default config')
            return new GuildConfig()
        }
        if (this.configCache.has(guildId)) {
            const cachedConfig = this.configCache.get(guildId)!
            logger.debug(`{getConfig} Cache hit for ${guildId}: screamOnSight = ${cachedConfig.screamOnSight}`)
            return cachedConfig
        }

        logger.debug(`{getConfig} Cache miss for ${guildId}, fetching from DB`)
        let config = await this.dataSource.getGuildConfig(guildId)
        if (!config) {
            config = new GuildConfig()
            config.guildId = guildId
            logger.debug(`{getConfig} No config found in DB for ${guildId}, creating default`)
        } else {
             logger.debug(`{getConfig} Fetched config from DB for ${guildId}: screamOnSight = ${config.screamOnSight}`)
        }


        const defaultGuildConfig = new GuildConfig()
        for (const key of Object.keys(defaultGuildConfig)) {
            const propKey = key as keyof GuildConfig
            if (config[propKey] === undefined || config[propKey] === null) {
                // @ts-expect-error ts(2322) - this is a db migration measure
                config[propKey] = defaultGuildConfig[propKey]
                logger.debug(`{getConfig} Merging default for ${propKey} for ${guildId}`)
            }
        }

        this.configCache.set(guildId, config)
        logger.debug(`{getConfig} Cache set for ${guildId}: screamOnSight = ${config.screamOnSight}`)
        return config
    }

    public async setConfig(guildId: GuildId, config: Partial<GuildConfig>): Promise<void> {
        logger.info(`{setConfig} Updating config for ${guildId} with ${JSON.stringify(config)}`)
        await this.dataSource.setGuildConfig(guildId, config)
        logger.ok(`{setConfig} DB updated for ${guildId}`)
        const updatedConfig = await this.getConfig(guildId) // This call should now log if it hits cache or DB
        this.configCache.set(guildId, updatedConfig)
        logger.ok(`{setConfig} Cache updated for ${guildId}: screamOnSight = ${updatedConfig.screamOnSight}`)
        this.emit('configUpdate', guildId, updatedConfig)
        logger.info(`{setConfig} Emitted configUpdate for ${guildId}`)
    }

    public async deleteConfig(guildId: GuildId): Promise<void> {
        await this.dataSource.deleteGuildConfig(guildId)
        this.configCache.delete(guildId)
    }
}
