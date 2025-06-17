import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | Formatters')

import { Client, User } from 'discord.js'
import type { UserStatus, MentionData } from '../../../types'

export async function formatUserMessage(
    username: string,
    displayName: string,
    serverDisplayName: string,
    content: string,
    respondingTo?: { targetUsername: string; targetText: string },
    guildName?: string,
    channelName?: string
): Promise<string> {
    const formattedMessage = {
        username,
        displayName,
        serverDisplayName,
        currentTime: new Date().toISOString(),
        text: content,
        mentions: [] as MentionData[],
        respondingTo: respondingTo,
        guildName: guildName,
        channelName: channelName
    }

    // Extract mentions from content if any exist
    const mentionRegex = /\{"type":"mention","id":"(\d+)","username":"([^"]+)"\}/g
    const mentions: MentionData[] = []
    let match: RegExpExecArray | null

    while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push({
            type: 'mention',
            id: match[1],
            username: match[2]
        })
    }

    if (mentions.length > 0) {
        formattedMessage.mentions = mentions
    }

    if (respondingTo) {
        formattedMessage.respondingTo = respondingTo
    }

    if (guildName || channelName) {
        if (guildName) formattedMessage.guildName = guildName
        if (channelName) formattedMessage.channelName = channelName
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
            const user = client.users.cache.get(userId) ? (client.users.cache.get(userId) as User) : await client.users.fetch(userId)
            const mentionJson = JSON.stringify({
                type: 'mention',
                id: userId,
                username: user.username
            })
            parsedText = parsedText.replace(match[0], mentionJson)
        } catch (e) {
            const error = e as Error
            logger.error(`Could not fetch user ${yellow(userId)}: ${red(error.message)}`)
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

        const roles = member.roles.cache
            .filter(role => role.name !== '@everyone')
            .map(role => role.name)
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
