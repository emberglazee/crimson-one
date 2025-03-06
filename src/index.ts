import { Logger } from './util/logger'
const logger = Logger.new()
logger.info('Starting bot')

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'
import chalk from 'chalk'

import CommandHandler from './modules/CommandManager'
import QuoteFactory from './modules/QuoteFactory'
import { GithubWebhook } from './modules/GithubWebhook'
import type { DiscordEventListener } from './types/types'
import { MarkovChat } from './modules/MarkovChain/MarkovChat'
import { AWACSFeed } from './modules/AWACSFeed'
import registerAwacsEvents from './events/awacsEvents'

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
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildModeration // For audit logs
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
export const quoteFactory = new QuoteFactory(bot)

bot.once('ready', async () => {
    logger.info(`Logged in as ${chalk.yellow(bot.user!.tag)}`)

    // Set client on QuoteImageFactory
    QuoteImageFactory.getInstance().setClient(bot)

    // Set client on MarkovChat
    MarkovChat.getInstance().setClient(bot)

    // Initialize AWACS Feed (it will be configured via command)
    const awacsModule = AWACSFeed.getInstance() 
    awacsModule.setClient(bot)
    await awacsModule.init(bot, '1347340883724603392')

    // Register AWACS event handlers
    registerAwacsEvents(bot)
    logger.ok('AWACS system initialized')

    // Set client and initialize command handler
    commandHandler.setClient(bot)
    await commandHandler.init()
    await commandHandler.refreshGlobalCommands()
    await commandHandler.refreshAllGuildCommands()

    // Initialize Github webhook and quote factory
    const webhook = GithubWebhook.getInstance({
        port: Number(process.env.GITHUB_WEBHOOK_PORT) || 3000,
        secret: process.env.GITHUB_WEBHOOK_SECRET!
    })
    await webhook.init(bot)
    await quoteFactory.init()

    const eventFiles = (
        await readdir(path.join(__dirname, 'events'))
    ).filter(file => file.endsWith('.ts') && file !== 'awacsEvents.ts') // Skip awacsEvents as it's handled separately
    for (const file of eventFiles) {
        const event = await import(path.join(__dirname, `events/${file}`)) as DiscordEventListener
        event.default(bot)
    }

    logger.ok('Commands initialized, bot ready')
})

// Add shutdown handlers
const handleShutdown = async () => {
    logger.warn('Shutting down...')
    bot.user!.setStatus('dnd')
    await bot.destroy()
    process.exit(0)
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)
process.on('SIGUSR2', handleShutdown) // For pm2 restarts
process.on('uncaughtException', async err => {
    logger.error(`Uncaught exception! -> ${chalk.red(err.message)}`)
    await handleShutdown()
})

bot.rest.on('rateLimited', rateLimitInfo => {
    logger.warn(
        'REST rate limit!\n'+
        `  Timeout:     ${chalk.yellow(rateLimitInfo.sublimitTimeout)}\n`+
        `  Limit:       ${chalk.yellow(rateLimitInfo.limit)}\n`+
        `  Method:      ${chalk.yellow(rateLimitInfo.method)}\n`+
        `  Retry after: ${chalk.yellow(rateLimitInfo.retryAfter)}`
    )
})

logger.info('Logging in...')
await bot.login(process.env.DISCORD_TOKEN)
logger.ok('Logged in')
