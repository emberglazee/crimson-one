import { Logger, yellow, red } from '../../util/logger'
const logger = new Logger('MarkovChain | DiscordUserApi')

import type { Client } from 'discord.js'

/**
 * Fetches the total message count from a Discord channel using the Discord User API
 * Requires a user token to be set in DISCORD_USER_TOKEN environment variable
 * Note: Thread channels are not supported by Discord's message search API
 */
export async function getChannelMessageCount(client: Client, guildId: string, channelId: string): Promise<number | null> {
    // Check if user token is available
    const userToken = process.env.DISCORD_USER_TOKEN
    if (!userToken) {
        logger.warn('DISCORD_USER_TOKEN not found in environment variables')
        return null
    }

    // Get the channel and check if it's a thread
    const channel = await client.channels.fetch(channelId)
    if (!channel) {
        logger.warn(`Channel ${yellow(channelId)} not found`)
        return null
    }

    if (channel.isThread()) {
        logger.warn(`Channel ${yellow(channelId)} is a thread - message search is not supported for threads`)
        return null
    }

    try {
        const url = `https://discord.com/api/v9/guilds/${guildId}/messages/search?channel_id=${channelId}`

        const response = await fetch(url, {
            headers: {
                'Authorization': userToken,
                'Content-Type': 'application/json'
            }
        })

        if (!response.ok) {
            const errorText = await response.text()
            logger.warn(`Discord API error: ${red(response.status)} - ${red(errorText)}`)
            return null
        }

        const data = await response.json()

        if (data && typeof data.total_results === 'number') {
            logger.ok(`Found ${yellow(data.total_results)} total messages in channel ${yellow(channelId)}`)
            return data.total_results
        }

        return null
    } catch (error) {
        logger.warn(`Failed to fetch message count: ${red(error instanceof Error ? error.message : String(error))}`)
        return null
    }
}
