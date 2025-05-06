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
import { ScreamOnSight } from './modules/ScreamOnSight'
import { gracefulShutdown } from './modules/GracefulShutdown'

import { registerFont } from 'canvas'
import { QuoteImageFactory } from './modules/QuoteImageFactory'
registerFont(path.join(__dirname, '../data/Roboto.ttf'), { family: 'Roboto' }) // Project Wingman
registerFont(path.join(__dirname, '../data/Aces07.ttf'), { family: 'Aces07' }) // Ace Combat 7
registerFont(path.join(__dirname, '../data/FSSinclairRegular.otf'), { family: 'FSSinclair' }) // Helldivers 2

const bot = new Client({
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

const commandManager = CommandManager.getInstance()
export const quoteFactory = new QuoteFactory(bot)
export const awacsFeed = new AWACSFeed(bot)
export const screamOnSight = new ScreamOnSight()
export const shapesInc = ShapesInc.getInstance()
bot.once('ready', async () => {
    logger.info(`Logged in as ${yellow(bot.user!.tag)}`)
    gracefulShutdown.setClient(bot)
    gracefulShutdown.registerShutdownHandlers()
    bot.user!.setStatus('dnd')

    QuoteImageFactory.getInstance().setClient(bot)

    MarkovChat.getInstance().setClient(bot)

    commandManager.setClient(bot)
    await commandManager.init()
    await commandManager.refreshGlobalCommands()
    await commandManager.refreshAllGuildCommands()

    await shapesInc.init()

    const webhook = GithubWebhook.getInstance({
        port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
        secret: process.env.GITHUB_WEBHOOK_SECRET!
    })
    await webhook.init(bot)
    await quoteFactory.init()

    const eventFiles = await readdir(path.join(__dirname, 'events'))
    for (const file of eventFiles) {
        const event = await import(path.join(__dirname, `events/${file}`)) as DiscordEventListener
        event.default(bot)
    }

    logger.ok('Commands initialized, bot ready')
    bot.user!.setStatus('online')
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
