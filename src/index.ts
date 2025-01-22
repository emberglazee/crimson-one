import { Logger } from './util/logger'
const logger = Logger.new()
logger.info('Starting bot')

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'

import CommandHandler from './modules/CommandManager'
import QuoteFactory from './modules/QuoteFactory'
import type { DiscordEventListener } from './types/types'

import { registerFont } from 'canvas'
registerFont(path.join(__dirname, '../data/Roboto.ttf'), { family: 'Roboto' })
registerFont(path.join(__dirname, '../data/Aces07.ttf'), { family: 'Aces07' })

const bot = new Client({
    intents: new IntentsBitField([
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
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

export const commandHandler = new CommandHandler(bot)
export const quoteFactory = new QuoteFactory(bot)

bot.once('ready', async () => {
    logger.ok(`Logged in as ${bot.user!.tag}`)
    await commandHandler.init()
    await commandHandler.refreshGlobalCommands()
    await quoteFactory.init()

    const eventFiles = (
        await readdir(path.join(__dirname, 'events'))
    ).filter(file => file.endsWith('.ts'))
    for (const file of eventFiles) {
        const event = await import(path.join(__dirname, `events/${file}`)) as DiscordEventListener
        event.default(bot)
    }

    logger.ok('Commands initialized, bot ready')
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
