import { singleton, inject } from 'tsyringe'
import { Logger } from './Logger'
import { User, Guild } from 'discord.js'
import { MarkovChat, type SimplifiedMessage } from './MarkovChain'

const logger = new Logger('MarkovBotManager')

export interface MarkovBotConfig {
    guild: Guild
    channelId: string
    user?: User
    userId?: string
    words?: number
}

interface MarkovBotInstance {
    config: MarkovBotConfig
    chainId: string
}

@singleton()
export class MarkovBotManager {
    private activeChannels = new Map<string, MarkovBotInstance>()

    public constructor(@inject(MarkovChat) private markovChat: MarkovChat) {}

    public async activate(channelId: string, config: MarkovBotConfig): Promise<void> {
        if (this.activeChannels.has(channelId)) {
            await this.deactivate(channelId)
        }

        logger.info(`Activating Markov bot for channel ${channelId}...`)

        const chainId = await this.markovChat.createPersistentChain({
            guild: config.guild,
            user: config.user,
            userId: config.userId
        })

        this.activeChannels.set(channelId, { config, chainId })
        logger.ok(`Markov bot activated for channel ${channelId} with chain ID ${chainId}.`)
    }

    public async deactivate(channelId: string): Promise<void> {
        const instance = this.activeChannels.get(channelId)
        if (instance) {
            await this.markovChat.destroyPersistentChain(instance.chainId)
            this.activeChannels.delete(channelId)
            logger.info(`Markov bot deactivated in channel ${channelId}`)
        }
    }

    public async deactivateAll(): Promise<void> {
        for (const channelId of this.activeChannels.keys()) {
            await this.deactivate(channelId)
        }
        logger.info('All Markov bots have been deactivated.')
    }

    public isChannelActive(channelId: string): boolean {
        return this.activeChannels.has(channelId)
    }

    public getInstance(channelId: string): MarkovBotInstance | undefined {
        return this.activeChannels.get(channelId)
    }

    public train(channelId: string, messages: SimplifiedMessage[]): void {
        const instance = this.activeChannels.get(channelId)
        if (instance) {
            this.markovChat.trainPersistentChain({ chainId: instance.chainId, messages })
        }
    }
}

