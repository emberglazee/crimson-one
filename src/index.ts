import { Logger } from './util/logger'
const logger = Logger.new()
logger.info('Starting bot')

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'

import CommandHandler from './modules/CommandManager'
import CrimsonChat from './modules/CrimsonChat'
import QuoteFactory from './modules/QuoteFactory'
import { GithubWebhook } from './modules/GithubWebhook'
import type { DiscordEventListener } from './types/types'

import { registerFont } from 'canvas'
import { QuoteImageFactory } from './modules/QuoteImageFactory'
registerFont(path.join(__dirname, '../data/Roboto.ttf'), { family: 'Roboto' })
registerFont(path.join(__dirname, '../data/Aces07.ttf'), { family: 'Aces07' })

const bot = new Client({
    intents: new IntentsBitField([
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildPresences,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent
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

const commandHandler = CommandHandler.getInstance()
const crimsonChat = CrimsonChat.getInstance()
export const quoteFactory = new QuoteFactory(bot)

bot.once('ready', async () => {
    logger.ok(`Logged in as ${bot.user!.tag}`)

    // Set client on QuoteImageFactory
    QuoteImageFactory.getInstance().setClient(bot)

    // Set client and initialize command handler
    commandHandler.setClient(bot)
    await commandHandler.init()
    await commandHandler.refreshGlobalCommands()

    // initialize CrimsonChat
    crimsonChat.setClient(bot)
    await crimsonChat.init()

    // Initialize Github webhook and quote factory
    const webhook = GithubWebhook.getInstance({
        port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
        secret: process.env.GITHUB_WEBHOOK_SECRET!
    })
    await webhook.init(bot)
    await quoteFactory.init()

    // Send startup message
    await crimsonChat.handleStartup()

    const eventFiles = (
        await readdir(path.join(__dirname, 'events'))
    ).filter(file => file.endsWith('.ts'))
    for (const file of eventFiles) {
        const event = await import(path.join(__dirname, `events/${file}`)) as DiscordEventListener
        event.default(bot)
    }

    logger.ok('Commands initialized, bot ready')
})

// Add shutdown handlers
const handleShutdown = async () => {
    logger.info('Shutting down...')
    await crimsonChat.handleShutdown()
    process.exit(0)
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)
process.on('SIGUSR2', handleShutdown) // For pm2 restarts
process.on('uncaughtException', async err => {
    logger.error(`Uncaught exception: ${err.message}`)
    await handleShutdown()
})

bot.rest.on('rateLimited', rateLimitInfo => {
    logger.warn(
        'Rate limit:\n'+
        `  Timeout: ${rateLimitInfo.sublimitTimeout}\n`+
        `  Limit: ${rateLimitInfo.limit}\n`+
        `  Method: ${rateLimitInfo.method}\n`+
        `  Retry after: ${rateLimitInfo.retryAfter}`
    )
})

bot.login(process.env.DISCORD_TOKEN)
