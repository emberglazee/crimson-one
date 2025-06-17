import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | set_display_name()')

import { z } from 'zod'
import { tool } from 'ai'
import { bot as client } from '../../..'
import { distance } from 'fastest-levenshtein'
import { type Guild, type GuildMember, PermissionsBitField } from 'discord.js'
import { EMBERGLAZE_ID } from '../../../util/constants'

// --- Constants from the original /banish command ---
const GUILD_ID = '958518067690868796'

const schema = z.object({
    id: z.string().optional().describe('Discord user ID; most accurate and pinpoint'),
    username: z.string().optional().describe('The user\'s global Discord username (e.g., "johndoe")'),
    displayname: z.string().optional().describe("The user's current display name in the server; the least accurate, performs a closest match search"),
    new_display_name: z.string().min(1).max(32).describe("The new display name for the user. Must be between 1 and 32 characters."),
    reason: z.string().optional().describe("Optional reason for changing the display name for the audit log.")
})
type Input = z.infer<typeof schema>

async function invoke({ id, username, displayname, new_display_name, reason }: Input): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ id, username, displayname, new_display_name, reason }))}`)
    const query = id ?? username ?? displayname
    if (!query) {
        return 'Error: must provide either a user ID, username, or current display name to identify the target.'
    }

    // 1. Fetch Guild and check bot permissions
    let guild: Guild
    try {
        guild = await client.guilds.fetch(GUILD_ID)
    } catch (e) {
        logger.error(`Failed to fetch guild ${GUILD_ID}: ${red((e as Error).message)}`)
        return `Error: Internal error, could not find the designated guild.`
    }

    const botMember = guild.members.me
    if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
        return `Error: I do not have the 'Manage Nicknames' permission to perform this action.`
    }

    // 2. Find the target member
    const member = await findMember(guild, query)
    if (!member) {
        return `Error: Could not find any member matching the query "${query}".`
    }

    // 3. Handle special cases
    if (member.id === client.user?.id) {
        // If the target is the bot itself, use setNickname
        try {
            await guild.members.me?.setNickname(new_display_name, reason ?? 'Display name changed by Crimson 1.')
            logger.ok(`Changed own display name to ${new_display_name}`)
            return `Success: I have changed my display name to "${new_display_name}".`
        } catch (e) {
            logger.error(`Failed to change own display name: ${red((e as Error).message)}`)
            return `Error: Failed to change my own display name. There might have been a permissions error.`
        }
    }
    if (member.id === EMBERGLAZE_ID) {
        return "I can't change my creator's display name. This is an invalid order."
    }
    if (!member.manageable) {
        return `Error: I cannot manage this user's nickname. They likely have a higher role than me or are the server owner. (Target: ${member.user.username})`
    }

    // 4. Set the new display name
    try {
        await member.setNickname(new_display_name, reason ?? 'Display name changed by Crimson 1.')
        logger.ok(`Changed ${member.user.username}'s display name to ${new_display_name}`)
    } catch (e) {
        logger.error(`Failed to set nickname for ${member.user.username}: ${red((e as Error).message)}`)
        return `Error: Failed to set the display name. There might have been a permissions error or the name is invalid.`
    }

    return `Success: User ${member.user.username}'s display name has been changed to "${new_display_name}".`
}

export default tool({
    description: 'Sets the display name (nickname) of a Discord server member, including the bot itself. This is a form of server moderation.',
    parameters: schema,
    execute: invoke
})

async function findMember(guild: Guild, query: string): Promise<GuildMember | null> {
    // by user id
    if (/^\d{17,20}$/.test(query)) {
        // valid discord snowflake
        try {
            const member = await guild.members.fetch(query)
            return member
        } catch {
            return null
        }
    }

    // by username
    await guild.members.fetch({ query: query, limit: 10 })
    const memberByUsername = guild.members.cache.find(
        member => member.user.username.toLowerCase() === query.toLowerCase()
    )
    if (memberByUsername) return memberByUsername

    // by display name
    let closestMatch: GuildMember | null = null
    let smallestDistance = Infinity
    for (const [_, member] of guild.members.cache) {
        const displayName = member.displayName.toLowerCase()
        const dist = distance(query.toLowerCase(), displayName)
        if (dist < smallestDistance) {
            smallestDistance = dist
            closestMatch = member
        }
    }
    // prevent anything thats more than half the distance
    const threshold = Math.floor(query.length / 2)
    if (closestMatch && smallestDistance <= threshold) {
        return closestMatch
    }

    return null
}
