import { Logger } from './modules'
import { yellow, red } from './util/colors'
const logger = new Logger()
logger.info('Starting bot')

import {
    QuoteImageFactory, QuoteFactory, MessageTrigger, GracefulShutdown, TagManager, DashboardServer,
    CrimsonChat, GuildConfigManager, MarkovChat, GithubWebhookManager, CommandManager, BanishmentManager
} from './modules'

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'
import { getInstances, setClients } from './util/functions'
import type { DiscordEventListener } from './types'

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

export const quoteFactory = new QuoteFactory(client)
export const messageTrigger = new MessageTrigger()

const [
    guildConfigManager, crimsonChat, banishmentManager, dashboardServer, tagManager, gracefulShutdown, quoteImageFactory, markovChat, commandManager, githubWebhookManager
] = getInstances(
    GuildConfigManager, CrimsonChat, BanishmentManager, DashboardServer, TagManager, GracefulShutdown, QuoteImageFactory, MarkovChat, CommandManager, GithubWebhookManager
)

client.once('ready', async () => {
    logger.info(`Logged in as ${yellow(client.user.tag)}`)
    client.user.setStatus('dnd')

    setClients(client,
        quoteImageFactory, markovChat, banishmentManager, crimsonChat, commandManager, gracefulShutdown, githubWebhookManager, dashboardServer
    )

    gracefulShutdown.registerShutdownHandlers()

    dashboardServer.start(Number(process.env.DASHBOARD_PORT) || 9826)

    await guildConfigManager.init()
    await commandManager.init()
    await banishmentManager.init()
    await tagManager.init()
    await crimsonChat.init()

    const webhook = githubWebhookManager
        .setWebhookOptions({
            port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
            secret: process.env.GITHUB_WEBHOOK_SECRET!
        })
    await webhook.init()

    await quoteFactory.init()

    const eventFiles = await readdir(path.join(__dirname, 'events'))
    for (const file of eventFiles) {
        const event = await import(path.join(__dirname, `events/${file}`)) as DiscordEventListener
        event.default(client)
    }

    logger.ok('Commands initialized, bot ready')
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
