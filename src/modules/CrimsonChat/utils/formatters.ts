import { Client } from 'discord.js'
import { Logger } from '../../../util/logger'
import type { FormattedUserMessage, UserStatus } from '../../../types/types'

const logger = new Logger('Formatters')

export async function formatUserMessage(
    client: Client | null,
    username: string,
    displayName: string,
    serverDisplayName: string,
    content: string,
    respondingTo?: { targetUsername: string; targetText: string }
): Promise<string> {
    let formattedMessage = ''

    if (respondingTo) {
        formattedMessage += `[ Replying to ${respondingTo.targetUsername}: "${respondingTo.targetText}" ]\n`
    }

    formattedMessage += `${username} (display: ${displayName}, server: ${serverDisplayName}): ${content}`
    return formattedMessage
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

export async function usernamesToMentions(client: Client, text: string): Promise<string> {
    const usernameRegex = /@(\w+)/g
    let modifiedText = text
    const matches = text.matchAll(usernameRegex)

    for (const match of matches) {
        const username = match[1]
        const user = client.users.cache.find(u => u.username === username)
        if (user) {
            modifiedText = modifiedText.replace(`@${username}`, `<@${user.id}>`)
        }
    }

    return modifiedText
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
