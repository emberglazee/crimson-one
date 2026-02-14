import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
const logger = new Logger('ServerConfigManager')

import { ServerConfigDataSource } from './DataSource'
import { EventEmitter } from 'tseep'
import { ServerConfig, type PlatformType } from './entities/ServerConfig'
import type { GuildId } from '../../types' // cosmetic type for clarity

type ServerId = string

@singleton()
export class ServerConfigManager extends EventEmitter<{
    configUpdate: (serverId: ServerId, config: ServerConfig) => void
}> {
    private configCache: Map<string, ServerConfig> = new Map()

    public constructor(private dataSource: ServerConfigDataSource) {
        super()
    }

    public async init() {
        await this.dataSource.init()
        logger.ok('Data source initialized')
    }

    /**
     * Get config for a server (Discord guild or Stoat server)
     * @param serverId - The server/guild ID
     * @param platform - The platform type ('discord' or 'stoat')
     * @returns ServerConfig with defaults applied
     */
    public async getConfig(
        serverId?: ServerId,
        platform: PlatformType = 'discord'
    ): Promise<ServerConfig> {
        if (!serverId) {
            return new ServerConfig()
        }

        const cacheKey = `${platform}:${serverId}`
        if (this.configCache.has(cacheKey)) {
            return this.configCache.get(cacheKey)!
        }

        let config = await this.dataSource.getServerConfig(serverId, platform)
        if (!config) {
            config = new ServerConfig()
            config.serverId = serverId
            config.platform = platform
        }

        // Apply defaults for any missing fields
        const defaultConfig = new ServerConfig()
        for (const key of Object.keys(defaultConfig)) {
            const propKey = key as keyof ServerConfig
            if (config[propKey] === undefined || config[propKey] === null) {
                // @ts-expect-error ts(2322) - this is a db migration measure
                config[propKey] = defaultConfig[propKey]
            }
        }

        this.configCache.set(cacheKey, config)
        return config
    }

    /**
     * @deprecated Use getConfig(serverId, platform) instead
     */
    public async getGuildConfig(guildId?: GuildId): Promise<ServerConfig> {
        return this.getConfig(guildId, 'discord')
    }

    /**
     * Set config for a server
     */
    public async setConfig(
        serverId: ServerId,
        platform: PlatformType,
        config: Partial<ServerConfig>
    ): Promise<void> {
        await this.dataSource.setServerConfig(serverId, platform, config)
        const cacheKey = `${platform}:${serverId}`
        this.configCache.delete(cacheKey)
        const updatedConfig = await this.getConfig(serverId, platform)
        this.emit('configUpdate', serverId, updatedConfig)
    }

    /**
     * @deprecated Use setConfig(serverId, platform, config) instead
     */
    public async setGuildConfig(
        guildId: GuildId,
        config: Partial<ServerConfig>
    ): Promise<void> {
        await this.setConfig(guildId, 'discord', config)
    }

    /**
     * Delete config for a server
     */
    public async deleteConfig(
        serverId: ServerId,
        platform: PlatformType
    ): Promise<void> {
        await this.dataSource.deleteServerConfig(serverId, platform)
        const cacheKey = `${platform}:${serverId}`
        this.configCache.delete(cacheKey)
    }

    /**
     * @deprecated Use deleteConfig(serverId, platform) instead
     */
    public async deleteGuildConfig(guildId: GuildId): Promise<void> {
        await this.deleteConfig(guildId, 'discord')
    }

    /**
     * Get all configs across all platforms
     */
    public async getAllConfigs(): Promise<ServerConfig[]> {
        return this.dataSource.getAllServerConfigs()
    }

    /**
     * @deprecated Use getAllConfigs() instead
     */
    public async getAllGuildConfigs(): Promise<ServerConfig[]> {
        return this.getAllConfigs()
    }
}

// Export both names for backward compatibility
export { ServerConfig }
