import 'reflect-metadata'
import { EventEmitter } from 'events'
import { container } from 'tsyringe'
import { Logger, MessageTrigger } from './modules'
import { stat } from 'fs/promises'
import { yellow, red } from './util/colors'

// Catch-all error handler to prevent EventEmitter from crashing on unhandled 'error' events
const originalEmit = EventEmitter.prototype.emit
EventEmitter.prototype.emit = function (
    event: string | symbol,
    ...args: unknown[]
) {
    if (event === 'error' && this.listenerCount('error') === 0) {
        console.warn('[EventEmitter] Unhandled error event:', args[0])
        return false
    }
    return originalEmit.apply(this, [event, ...args])
}

const logger = new Logger()

if (!(await stat('./data/.initialized').catch(() => false))) {
    logger.info('First-time setup detected, running initialization...')
    const envExists = await stat('./.env').catch(() => false)
    await import('./init')
    if (!envExists) {
        logger.info(
            'Initialization complete, please fill out (or double check) the ./.env file and restart the bot.'
        )
        process.exit(1)
    }
    logger.ok('Initialization complete, proceeding with existing ./.env file.')
}

logger.info('Starting the bot...')

import {
    SubtitleThreadManager,
    GracefulShutdown,
    TagManager,
    DashboardServer,
    CrimsonChat,
    ServerConfigManager,
    GithubWebhookManager,
    CommandManager,
    BanishmentManager,
    SleepAsAndroidWebhookManager,
    LongTermMemoryManager,
    AntiRaidManager,
    MarkovBotManager,
    MarkovChat
} from './modules'

import { readdir } from 'fs/promises'
import path from 'path'
import type { DiscordEventListener } from './types'
import { resolveServices } from './util/functions'
import { PlatformManager } from './platform/PlatformManager'

// Initialize PlatformManager (handles both Discord and Stoat)
const platformManager = new PlatformManager()

// Register PlatformManager for DI - Using class constructor as token
container.register(PlatformManager, {
    useValue: platformManager
})

// Initialize platforms
await platformManager.initialize()

// Register the primary Discord client for backward compatibility
const discordClient = platformManager.getClient('discord')
if (!discordClient) {
    throw new Error('Discord client not available - Discord is required')
}

// Get the underlying Discord.js client for managers that still need it
// This maintains backward compatibility during migration
const discordJSClient =
    container.resolve<import('discord.js').Client>('DiscordJSClient')
container.register<import('discord.js').Client>('Client', {
    useValue: discordJSClient
})

// Resolve all services from the container
const [
    commandManager,
    gracefulShutdown,
    dashboardServer,
    serverConfigManager,
    banishmentManager,
    tagManager,
    crimsonChat,
    githubWebhookManager,
    subtitleThreadManager,
    messageTrigger,
    sleepAsAndroidWebhookManager,
    longTermMemoryManager,
    antiRaidManager,
    markovBotManager,
    markovChat
] = resolveServices(
    container,
    CommandManager,
    GracefulShutdown,
    DashboardServer,
    ServerConfigManager,
    BanishmentManager,
    TagManager,
    CrimsonChat,
    GithubWebhookManager,
    SubtitleThreadManager,
    MessageTrigger,
    SleepAsAndroidWebhookManager,
    LongTermMemoryManager,
    AntiRaidManager,
    MarkovBotManager,
    MarkovChat
)

// Setup event handlers for all platforms
platformManager.on('ready', async platform => {
    logger.ok(`${platform} is ready`)

    if (platform === 'discord') {
        // Discord is the primary platform - initialize core services
        const primaryClient = platformManager.getPrimaryClient()
        if (primaryClient?.user) {
            logger.info(`Logged in as ${yellow(primaryClient.user.username)}.`)
        }

        gracefulShutdown.registerShutdownHandlers()

        dashboardServer.start(Number(process.env.DASHBOARD_PORT) || 9826)

        await serverConfigManager.init()
        await commandManager.init()
        await banishmentManager.init()
        await tagManager.init()
        await crimsonChat.init()
        await longTermMemoryManager.init()
        await antiRaidManager.init()

        const webhook = githubWebhookManager.setWebhookOptions({
            port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
            secret: process.env.GITHUB_WEBHOOK_SECRET!
        })
        await webhook.init()

        const sleepWebhook = sleepAsAndroidWebhookManager.setWebhookOptions({
            port: Number(process.env.SLEEP_WEBHOOK_PORT) || 99603
        })
        await sleepWebhook.init()

        await subtitleThreadManager.init()

        // Load and setup event handlers
        const eventFiles = await readdir(path.join(__dirname, 'events'))
        for (const file of eventFiles) {
            const event = (await import(
                path.join(__dirname, `events/${file}`)
            )) as DiscordEventListener
            // Pass the Discord.js client - messageCreate handler still uses Discord-specific APIs
            // NOTE: For full multi-platform support, message handlers need to be refactored to use
            // IPlatformMessage interface instead of discord.js Message type. Stoat messages currently
            // only support text commands via handlePlatformMessage in the platformManager handler below.
            if (file === 'messageCreate.ts') {
                event.default(discordJSClient, {
                    tagManager,
                    serverConfigManager,
                    commandManager,
                    crimsonChat,
                    messageTrigger,
                    antiRaidManager,
                    markovBotManager,
                    markovChat
                })
            } else if (file === 'interactionCreate.ts') {
                event.default(discordJSClient, commandManager)
            } else if (file === 'messageDelete.ts') {
                event.default(discordJSClient, crimsonChat)
            } else if (file === 'messageUpdate.ts') {
                event.default(discordJSClient, crimsonChat)
            } else {
                event.default(discordJSClient)
            }
        }

        logger.ok('Commands initialized, bot ready.')

        // Set bot status to online
        if (discordJSClient.user) {
            discordJSClient.user.setStatus('online')
        }

        if (typeof process.send === 'function') {
            process.send({ type: 'READY' })
        }
    }

    if (platform === 'stoat') {
        logger.ok('Stoat platform ready and listening for events')
        // Stoat-specific initialization can go here
        // For now, it will receive events but not have full feature parity
    }
})

// Handle messages from all platforms
platformManager.on('messageCreate', async (message, platform) => {
    if (platform === 'stoat') {
        // Get server config for prefix
        const serverId = message.server?.id
        const config = await serverConfigManager.getConfig(serverId, 'stoat')
        const prefix = config.prefix || 'c1!'

        // Process text commands for Stoat
        if (message.content.startsWith(prefix)) {
            try {
                await commandManager.handlePlatformMessage(message, prefix)
            } catch (error) {
                logger.error(`Error handling Stoat command: ${error}`)
            }
        }
    }
})

platformManager.on('error', (error, platform) => {
    logger.error(`Error on ${platform}: ${error.message}`)
})

// Emit ready events for platforms that are already ready
// This must be called AFTER all event handlers are attached
platformManager.emitReadyForInitializedPlatforms()

process.on('uncaughtException', async err => {
    logger.error(`Uncaught exception: ${red(err.message)}`)
    await platformManager.shutdown()
    await gracefulShutdown.shutdown('uncaughtException')
})

process.on('unhandledRejection', async (reason, promise) => {
    logger.error(
        `Unhandled rejection at: ${red(promise)}, reason: ${red(reason)}`
    )
    await platformManager.shutdown()
    await gracefulShutdown.shutdown('unhandledRejection')
})

// Graceful shutdown handler
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...')
    await platformManager.shutdown()
    process.exit(0)
})

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...')
    await platformManager.shutdown()
    process.exit(0)
})
