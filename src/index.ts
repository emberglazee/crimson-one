import { BanishmentManager } from './modules/BanishmentManager'
import { Logger, yellow, red } from './util/logger'
const logger = new Logger()
logger.info('Starting bot')

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'
import type { DiscordEventListener } from './types'

import CommandManager from './modules/CommandManager'
import QuoteFactory from './modules/QuoteFactory'
import ShapesInc from './modules/ShapesInc'
import { GithubWebhook } from './modules/GithubWebhook'
import { MarkovChat } from './modules/MarkovChain/MarkovChat'
import { AWACSFeed } from './modules/AWACSFeed'
import { MessageTrigger } from './modules/MessageTrigger'
import { gracefulShutdown } from './modules/GracefulShutdown'
import GuildConfigManager from './modules/GuildConfig'
import { QuoteImageFactory } from './modules/QuoteImageFactory'
import CrimsonChat from './modules/CrimsonChat'

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

export const guildConfigManager = GuildConfigManager.getInstance()
const commandManager = CommandManager.getInstance().setClient(client)
export const quoteFactory = new QuoteFactory(client)
export const awacsFeed = new AWACSFeed(client)
export const messageTrigger = new MessageTrigger()
export const shapesInc = ShapesInc.getInstance(client, '1335992675459141632')
export const crimsonChat = CrimsonChat.getInstance()
export const banishmentManager = BanishmentManager.getInstance().setClient(client)

client.once('ready', async () => {
    logger.info(`Logged in as ${yellow(client.user.tag)}`)
    gracefulShutdown.setClient(client)
    gracefulShutdown.registerShutdownHandlers()
    client.user.setStatus('dnd')

    QuoteImageFactory.getInstance().setClient(client)

    MarkovChat.getInstance().setClient(client)

    await guildConfigManager.init()
    await banishmentManager.init()

    await commandManager.init()

    await shapesInc.init()

    crimsonChat.setClient(client)
    await crimsonChat.init()

    const webhook = GithubWebhook.getInstance()
        .setWebhookOptions({
            port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
            secret: process.env.GITHUB_WEBHOOK_SECRET!
        })
        .setClient(client)
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
