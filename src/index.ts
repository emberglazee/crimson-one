import { Logger } from './util/logger'
const logger = Logger.new()
logger.info('Starting bot')

import { readdir } from 'fs/promises'
import path from 'path'
import { Client, IntentsBitField, Partials } from 'discord.js'

import CommandHandler from './modules/CommandManager'
import type { DiscordEventListener } from './util/types'

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

bot.once('ready', async () => {
    logger.ok(`Logged in as ${bot.user!.tag}`)
    await commandHandler.init()
    await commandHandler.refreshGlobalCommands()

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
