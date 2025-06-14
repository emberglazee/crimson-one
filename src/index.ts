import { Logger, yellow, red } from './util/logger'
const logger = new Logger()
logger.info('Starting bot')

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'
import type { DiscordEventListener } from './types/types'

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

export const bot = new Client({
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

export const guildConfigManager = GuildConfigManager.getInstance()
const commandManager = CommandManager.getInstance().setClient(bot)
export const quoteFactory = new QuoteFactory(bot)
export const awacsFeed = new AWACSFeed(bot)
export const messageTrigger = new MessageTrigger()
export const shapesInc = ShapesInc.getInstance(bot, '1335992675459141632')
export const crimsonChat = CrimsonChat.getInstance()
bot.once('ready', async () => {
    logger.info(`Logged in as ${yellow(bot.user!.tag)}`)
    gracefulShutdown.setClient(bot)
    gracefulShutdown.registerShutdownHandlers()
    bot.user!.setStatus('dnd')

    QuoteImageFactory.getInstance().setClient(bot)

    MarkovChat.getInstance().setClient(bot)

    await guildConfigManager.init()

    await commandManager.init()
    await commandManager.refreshGlobalCommands()
    await commandManager.refreshAllGuildCommands()

    await shapesInc.init()

    crimsonChat.setClient(bot)
    await crimsonChat.init()

    const webhook = GithubWebhook.getInstance()
        .setWebhookOptions({
            port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
            secret: process.env.GITHUB_WEBHOOK_SECRET!
        })
        .setClient(bot)
    await webhook.init()

    await quoteFactory.init()

    const eventFiles = await readdir(path.join(__dirname, 'events'))
    for (const file of eventFiles) {
        const event = await import(path.join(__dirname, `events/${file}`)) as DiscordEventListener
        event.default(bot)
    }

    logger.ok('Commands initialized, bot ready')
    bot.user!.setStatus('online')
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

logger.info('Logging in...')
await bot.login(process.env.DISCORD_TOKEN)
logger.ok('Logged in')
