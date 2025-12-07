import 'reflect-metadata'
import { container } from 'tsyringe'
import { Logger, MessageTrigger } from './modules'
import { stat } from 'fs/promises'
import { yellow, red } from './util/colors'

const logger = new Logger()

if (!await stat('./data/.initialized').catch(() => false)) {
    logger.info('First-time setup detected, running initialization...')
    const envExists = await stat('./.env').catch(() => false)
    await import('./init')
    if (!envExists) {
        logger.info('Initialization complete, please fill out (or double check) the ./.env file and restart the bot.')
        process.exit(1)
    }
    logger.ok('Initialization complete, proceeding with existing ./.env file.')
}

logger.info('Starting the bot...')

import {
    SubtitleThreadManager, GracefulShutdown, TagManager, DashboardServer, CrimsonChat,
    GuildConfigManager, GithubWebhookManager, CommandManager, BanishmentManager, SleepAsAndroidWebhookManager, LongTermMemoryManager, AntiRaidManager
} from './modules'

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'
import type { DiscordEventListener } from './types'
import { resolveServices } from './util/functions'

const unreadyClient = new Client({
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

logger.info('Logging in...')
await unreadyClient.login(process.env.DISCORD_TOKEN)
export const client = unreadyClient as Client<true>
logger.ok('Logged in')

// Register the client instance for injection
container.register<Client>('Client', { useValue: client })

// Resolve all services from the container
const [
    commandManager, gracefulShutdown, dashboardServer, guildConfigManager, banishmentManager, tagManager, crimsonChat, githubWebhookManager, subtitleThreadManager, messageTrigger, sleepAsAndroidWebhookManager, longTermMemoryManager, antiRaidManager
] = resolveServices(container,
    CommandManager, GracefulShutdown, DashboardServer, GuildConfigManager, BanishmentManager, TagManager, CrimsonChat, GithubWebhookManager, SubtitleThreadManager, MessageTrigger, SleepAsAndroidWebhookManager, LongTermMemoryManager, AntiRaidManager
)

client.once('clientReady', async () => {
    logger.info(`Logged in as ${yellow(client.user.tag)}.`)
    client.user.setStatus('dnd')

    gracefulShutdown.registerShutdownHandlers()

    dashboardServer.start(Number(process.env.DASHBOARD_PORT) || 9826)

    await guildConfigManager.init()
    await commandManager.init()
    await banishmentManager.init()
    await tagManager.init()
    await crimsonChat.init()
    await longTermMemoryManager.init()
    await antiRaidManager.init()

    const webhook = githubWebhookManager
        .setWebhookOptions({
            port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
            secret: process.env.GITHUB_WEBHOOK_SECRET!
        })
    await webhook.init()

    const sleepWebhook = sleepAsAndroidWebhookManager
        .setWebhookOptions({
            port: Number(process.env.SLEEP_WEBHOOK_PORT) || 99603
        })
    await sleepWebhook.init()

    await subtitleThreadManager.init()

    const eventFiles = await readdir(path.join(__dirname, 'events'))
    for (const file of eventFiles) {
        const event = await import(path.join(__dirname, `events/${file}`)) as DiscordEventListener
        if (file === 'messageCreate.ts') {
            event.default(client, { tagManager, guildConfigManager, commandManager, crimsonChat, messageTrigger, antiRaidManager })
        } else if (file === 'interactionCreate.ts') {
            event.default(client, commandManager)
        } else if (file === 'messageDelete.ts') {
            event.default(client, crimsonChat)
        } else if (file === 'messageUpdate.ts') {
            event.default(client, crimsonChat)
        } else {
            event.default(client)
        }
    }

    logger.ok('Commands initialized, bot ready.')
    client.user.setStatus('online')
    if (typeof process.send === 'function') {
        process.send({ type: 'READY' })
    }
})

process.on('uncaughtException', async err => {
    logger.error(`Uncaught exception: ${red(err.message)}`)
    await gracefulShutdown.shutdown('uncaughtException')
})
process.on('unhandledRejection', async (reason, promise) => {
    logger.error(`Unhandled rejection at: ${red(promise)}, reason: ${red(reason)}`)
    await gracefulShutdown.shutdown('unhandledRejection')
})
