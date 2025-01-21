import { Logger } from './util/logger'
const logger = new Logger()
logger.info('Starting bot')

import { Client, IntentsBitField, Partials } from 'discord.js'

import CommandHandler from './modules/CommandManager'

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
    logger.ok(`Logged in as ${bot.user?.tag}`)
    await commandHandler.init()
    await commandHandler.refreshGlobalCommands()
    logger.ok('Commands initialized, bot ready')
})
bot.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return
    commandHandler.handleInteraction(interaction)
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
