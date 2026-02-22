import { EventEmitter } from 'tseep'
import { container, singleton } from 'tsyringe'
import { Logger } from '../modules/Logger'
import type {
    IPlatformClient,
    IPlatformMessage,
    IPlatformServerMember
} from './interfaces'
import { DiscordClientAdapter } from './adapters/DiscordAdapter'
import { StoatClientAdapter } from './adapters/StoatAdapter'
import { Client as DiscordClient, IntentsBitField, Partials } from 'discord.js'
import { Client as StoatClient } from 'stoat.js'

const logger = new Logger('PlatformManager')

export type PlatformType = 'discord' | 'stoat'

export interface PlatformConfig {
    type: PlatformType
    enabled: boolean
    client: IPlatformClient
    isPrimary: boolean
}

@singleton()
export class PlatformManager extends EventEmitter<{
    ready: (platform: PlatformType) => void
    messageCreate: (message: IPlatformMessage, platform: PlatformType) => void
    messageUpdate: (
        message: IPlatformMessage,
        oldMessage: IPlatformMessage | null,
        platform: PlatformType,
    ) => void
    messageDelete: (message: IPlatformMessage, platform: PlatformType) => void
    serverMemberJoin: (
        member: IPlatformServerMember,
        platform: PlatformType,
    ) => void
    serverMemberLeave: (
        member: IPlatformServerMember,
        platform: PlatformType,
    ) => void
    error: (error: Error, platform: PlatformType) => void
}> {
    private platforms = new Map<PlatformType, PlatformConfig>()
    private readyPlatforms = new Set<PlatformType>()
    private isInitialized = false

    constructor() {
        super()
    }

    /**
     * Emit 'ready' events for platforms that are already initialized.
     * Call this after attaching your 'ready' event listener to catch up on missed events.
     */
    emitReadyForInitializedPlatforms(): void {
        for (const platform of this.readyPlatforms) {
            logger.ok(`${platform} is ready (replaying for late listener)`)
            this.emit('ready', platform)
        }
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            logger.warn('PlatformManager already initialized')
            return
        }

        logger.info('Initializing PlatformManager...')

        // Initialize Discord (primary platform)
        await this.initializeDiscord()

        // Initialize Stoat (optional secondary platform)
        if (process.env.STOAT_ENABLED === 'true' && process.env.STOAT_TOKEN) {
            await this.initializeStoat()
        } else {
            logger.info('Stoat platform disabled or not configured')
        }

        this.isInitialized = true
        logger.ok(
            `PlatformManager initialized with ${this.platforms.size} platform(s)`
        )
    }

    private async initializeDiscord(): Promise<void> {
        logger.info('Initializing Discord client...')

        const discordClient = new DiscordClient({
            intents: new IntentsBitField([
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMembers,
                IntentsBitField.Flags.GuildPresences,
                IntentsBitField.Flags.GuildMessages,
                IntentsBitField.Flags.MessageContent,
                IntentsBitField.Flags.GuildModeration
            ]),
            partials: [
                Partials.Channel,
                Partials.GuildMember,
                Partials.Message,
                Partials.User
            ],
            allowedMentions: {
                parse: ['users']
            }
        })

        await discordClient.login(process.env.DISCORD_TOKEN)

        // Wait for client to be ready
        await new Promise<void>(resolve => {
            discordClient.once('clientReady', () => resolve())
        })

        const adapter = new DiscordClientAdapter(discordClient)

        this.platforms.set('discord', {
            type: 'discord',
            enabled: true,
            client: adapter,
            isPrimary: true
        })

        // Register for DI
        container.register<IPlatformClient>('DiscordClient', {
            useValue: adapter
        })
        container.register<DiscordClient>('DiscordJSClient', {
            useValue: discordClient
        })

        // Setup event forwarding
        this.setupPlatformEvents(adapter, 'discord')

        logger.ok('Discord client initialized and ready')
    }

    private async initializeStoat(): Promise<void> {
        logger.info('Initializing Stoat client...')

        const token = process.env.STOAT_TOKEN
        if (!token || token.length < 10) {
            logger.warn(
                'Stoat token is missing or invalid, skipping Stoat initialization'
            )
            return
        }

        const maxRetries = 3
        const retryDelay = 2000 // 2 seconds

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            let stoatClient: StoatClient | null = null

            try {
                stoatClient = new StoatClient({
                    baseURL:
                        process.env.STOAT_BASE_URL || 'https://api.revolt.chat',
                    partials: true,
                    autoReconnect: true,
                    syncUnreads: false
                })

                // Add error handler immediately to catch any connection errors
                stoatClient.on('error', err => {
                    logger.warn(
                        `Stoat client error (may be expected during connection): ${err instanceof Error ? err.message : String(err)}`
                    )
                })

                // Login as bot
                await stoatClient.loginBot(token)

                // Wait for connection
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Stoat connection timeout'))
                    }, 30000)

                    stoatClient!.once('ready', () => {
                        clearTimeout(timeout)
                        resolve()
                    })

                    stoatClient!.once('error', err => {
                        clearTimeout(timeout)
                        reject(err)
                    })
                })

                const adapter = new StoatClientAdapter(stoatClient!)

                // Configure connection mode
                const mode =
                    (process.env.STOAT_CONNECTION_MODE?.toLowerCase() ||
                        'websocket') as 'websocket' | 'polling' | 'hybrid'
                adapter.setConnectionMode(mode)

                this.platforms.set('stoat', {
                    type: 'stoat',
                    enabled: true,
                    client: adapter,
                    isPrimary: false
                })

                // Register for DI
                container.register<IPlatformClient>('StoatClient', {
                    useValue: adapter
                })

                // Setup event forwarding
                this.setupPlatformEvents(adapter, 'stoat')

                logger.ok('Stoat client initialized and ready')
                return // Success - exit the retry loop
            } catch (error) {
                let errorMessage: string
                if (error instanceof Error) {
                    errorMessage = error.message
                } else if (error && typeof error === 'object') {
                    // Handle ErrorEvent and other error objects
                    const errorObj = error as Record<string, unknown>
                    if ('message' in errorObj) {
                        errorMessage = String(errorObj.message)
                    } else if ('type' in errorObj) {
                        errorMessage = `ErrorEvent: ${errorObj.type}`
                    } else {
                        errorMessage = JSON.stringify(error)
                    }
                } else {
                    errorMessage = String(error)
                }

                if (attempt < maxRetries) {
                    logger.warn(
                        `Stoat client connection failed (attempt ${attempt}/${maxRetries}): ${errorMessage}. Retrying in ${retryDelay}ms...`
                    )
                    await new Promise(resolve =>
                        setTimeout(resolve, retryDelay)
                    )
                } else {
                    logger.error(
                        `Failed to initialize Stoat client after ${maxRetries} attempts: ${errorMessage}`
                    )
                    // Log additional details for debugging
                    if (error && typeof error === 'object') {
                        logger.debug(
                            `Stoat error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
                        )
                    }
                    // Don't throw - Stoat is optional
                }
            }
        }
    }

    private setupPlatformEvents(
        client: IPlatformClient,
        platform: PlatformType
    ): void {
        client.on('ready', () => {
            logger.ok(`${platform} is ready`)
            this.readyPlatforms.add(platform)
            this.emit('ready', platform)
        })

        client.on('messageCreate', message => {
            this.emit('messageCreate', message, platform)
        })

        client.on('messageUpdate', (message, oldMessage) => {
            this.emit('messageUpdate', message, oldMessage, platform)
        })

        client.on('messageDelete', message => {
            this.emit('messageDelete', message, platform)
        })

        client.on('serverMemberJoin', member => {
            this.emit('serverMemberJoin', member, platform)
        })

        client.on('serverMemberLeave', member => {
            this.emit('serverMemberLeave', member, platform)
        })

        client.on('error', error => {
            logger.error(`Error on ${platform}: ${error.message}`)
            this.emit('error', error, platform)
        })
    }

    getPlatform(type: PlatformType): PlatformConfig | undefined {
        return this.platforms.get(type)
    }

    getClient(type: PlatformType): IPlatformClient | undefined {
        return this.platforms.get(type)?.client
    }

    getPrimaryClient(): IPlatformClient | undefined {
        for (const [, config] of this.platforms) {
            if (config.isPrimary) {
                return config.client
            }
        }
        // Fallback to first available
        return this.platforms.values().next().value?.client
    }

    getAllClients(): IPlatformClient[] {
        return Array.from(this.platforms.values())
            .filter(p => p.enabled)
            .map(p => p.client)
    }

    isPlatformEnabled(type: PlatformType): boolean {
        return this.platforms.get(type)?.enabled ?? false
    }

    getEnabledPlatforms(): PlatformType[] {
        return Array.from(this.platforms.values())
            .filter(p => p.enabled)
            .map(p => p.type)
    }

    async shutdown(): Promise<void> {
        logger.info('Shutting down all platforms...')

        const disconnectPromises: Promise<void>[] = []

        for (const [type, config] of this.platforms) {
            if (config.enabled) {
                disconnectPromises.push(
                    config.client
                        .disconnect()
                        .then(() => logger.ok(`${type} disconnected`))
                        .catch(err =>
                            logger.error(
                                `Error disconnecting ${type}: ${err.message}`
                            )
                        )
                )
            }
        }

        await Promise.all(disconnectPromises)
        this.platforms.clear()
        this.isInitialized = false

        logger.ok('All platforms shut down')
    }
}
