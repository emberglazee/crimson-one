import { Logger, yellow, red } from './util/logger'
const logger = new Logger('DeleteCommands')

import { ActivityType, Client, IntentsBitField } from 'discord.js'
import CommandManager from './modules/CommandManager'

// Create a minimal client with only the necessary intents
const client = new Client({
    intents: new IntentsBitField([
        IntentsBitField.Flags.Guilds
    ])
})

// Initialize the command manager
const commandManager = CommandManager.getInstance()

// Handle client ready event
client.once('ready', async () => {
    logger.info(`Logged in as ${yellow(client.user!.tag)}`)
    // Change presence to DND and "Maintenance..."
    client.user!.setPresence({
        status: 'dnd',
        activities: [{
            name: 'Maintenance...',
            type: ActivityType.Custom
        }]
    })

    try {
        // Set the client in command manager
        commandManager.setClient(client)
        await commandManager.init()

        // Delete all global commands
        logger.info('Starting deletion of all global commands...')
        await commandManager.deleteAllGlobalCommands()
        logger.ok('Successfully deleted all global commands')

        // Delete all registered guild commands
        logger.info('Starting deletion of all registered guild commands...')
        await commandManager.deleteAllRegisteredGuildCommands()
        logger.ok('Successfully deleted all registered guild commands')
    } catch (error) {
        logger.error(`Failed to delete commands: ${red(error)}`)
    } finally {
        // Always destroy the client when done
        client.destroy()
    }
})

// Handle errors
client.on('error', error => {
    logger.error(`Client error: ${red(error)}`)
    client.destroy()
})

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...')
    client.destroy()
    process.exit(0)
})

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...')
    client.destroy()
    process.exit(0)
})

// Start the script
logger.info('Starting command deletion script...')
await client.login(process.env.DISCORD_TOKEN)
