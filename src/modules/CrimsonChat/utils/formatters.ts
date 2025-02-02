import { Client } from 'discord.js'
import { Logger } from '../../../util/logger'
import type { FormattedUserMessage, UserStatus } from '../../../types/types'

const logger = new Logger('Formatters')

export async function formatUserMessage(
    client: Client | null,
    username: string,
    displayName: string,
    serverDisplayName: string,
    text: string,
    respondingTo?: { targetUsername: string; targetText: string },
    attachments?: string[]
): Promise<string> {
    let userStatus: UserStatus | 'unknown' = 'unknown'

    if (client) {
        const user = client.users.cache.find(u => u.username === username)
        if (user) {
            try {
                const guild = client.guilds.cache.first()
                if (guild) {
                    const member = await guild.members.fetch(user.id)
                    if (member) {
                        // Force fetch presence
                        await member.fetch(true)
                        const presence = member.presence

                        const roles = member.roles.cache.map(role => role.name)
                        const activities = presence?.activities?.map(activity => ({
                            name: activity.name,
                            type: activity.type,
                            state: activity.state ?? undefined,
                            details: activity.details ?? undefined,
                            createdAt: activity.createdAt.toISOString()
                        })) || []

                        userStatus = {
                            roles,
                            presence: activities.length ? activities : 'offline or no activities'
                        }
                    }
                }
            } catch (error) {
                logger.error(`Error fetching user status: ${error}`)
            }
        }
    }

    const formattedMessage: FormattedUserMessage = {
        username,
        displayName,
        serverDisplayName,
        currentTime: new Date().toISOString(),
        text: client ? await parseMentions(client, text) : text,
        attachments,
        respondingTo,
        userStatus
    }

    return JSON.stringify(formattedMessage)
}

export async function parseMentions(client: Client, text: string): Promise<string> {
    const mentionRegex = /<@!?(\d+)>/g
    let parsedText = text
    const mentions = text.matchAll(mentionRegex)

    for (const match of mentions) {
        const userId = match[1]
        try {
            const user = await client.users.fetch(userId)
            parsedText = parsedText.replace(match[0], `@${user.username}`)
        } catch (e) {
            const error = e as Error
            logger.error(`Could not fetch user ${userId}: ${error.message}`)
        }
    }

    return parsedText
}

export async function formatUserStatus(client: Client, username: string): Promise<UserStatus | 'unknown'> {
    const userId = client.users.cache.find(u => u.username === username)?.id
    if (!userId) return 'unknown'

    try {
        const guild = client.guilds.cache.first()
        if (!guild) return 'unknown'

        const member = await guild.members.fetch(userId)
        if (!member) return 'unknown'

        await member.fetch(true)
        const presence = member.presence

        const roles = member.roles.cache.map(role => role.name)
        const activities = presence?.activities?.map(activity => ({
            name: activity.name,
            type: activity.type,
            state: activity.state ?? undefined,
            details: activity.details ?? undefined,
            createdAt: activity.createdAt.toISOString()
        })) || []

        return {
            roles,
            presence: activities.length ? activities : 'offline or no activities'
        }
    } catch (error) {
        logger.error(`Error fetching user status: ${error}`)
        return 'unknown'
    }
}
