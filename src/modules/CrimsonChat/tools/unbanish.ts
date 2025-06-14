import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | unbanish()')

import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { z } from 'zod'
import { bot as client } from '../../..'
import { distance } from 'fastest-levenshtein'
import { ChannelType, type Guild, type GuildMember, PermissionsBitField } from 'discord.js'

// --- Constants from the original /unbanish command ---
const GUILD_ID = '958518067690868796'
const BANISHED_ROLE_ID = '1331170880591757434'
const GENERAL_CHANNEL_ID = '1267488539503886386'

const schema = z.object({
    id: z.string().optional().describe('Discord user ID; most accurate and pinpoint'),
    username: z.string().optional().describe('The user\'s global Discord username (e.g., "johndoe")'),
    displayname: z.string().optional().describe("The user's display name in the server; the least accurate, performs a closest match search"),
    reason: z.string().optional().describe("Optional reason for the unbanishment for the audit log.")
})
type Input = z.infer<typeof schema>

async function unbanishUser({ id, username, displayname, reason }: Input): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ id, username, displayname, reason }))}`)
    const query = id ?? username ?? displayname
    if (!query) {
        return 'Error: must provide either a user ID, username, or display name to identify the target.'
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
    if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return `Error: I do not have the 'Manage Roles' permission to perform this action.`
    }

    // 2. Find the target member
    const member = await findMember(guild, query)
    if (!member) {
        return `Error: Could not find any member matching the query "${query}".`
    }

    // 3. Handle special cases
    if (member.id === client.user?.id) {
        return "What did you think was gonna happen?"
    }
     if (!member.manageable) {
        return `Error: I cannot manage this user. They likely have a higher role than me. (Target: ${member.user.username})`
    }

    // 4. Fetch the role and check if user has it
    const role = await guild.roles.fetch(BANISHED_ROLE_ID).catch(() => null)
    if (!role) {
        return `Error: The 'banished' role (ID: ${BANISHED_ROLE_ID}) does not exist in this server.`
    }

    if (!member.roles.cache.has(role.id)) {
        return `Information: The user ${member.user.username} is not currently banished.`
    }

    // 5. Unbanish the user
    try {
        await member.roles.remove(role, reason ?? 'Unbanishment issued by Crimson 1.')
        logger.ok(`Unbanished ${member.user.username} (ID: ${member.id})`)
    } catch (e) {
        logger.error(`Failed to remove role from ${member.user.username}: ${red((e as Error).message)}`)
        return `Error: Failed to remove the banished role. There might have been a permissions error.`
    }

    // 6. Send message to the general channel
    try {
        const generalChannel = await guild.channels.fetch(GENERAL_CHANNEL_ID)
        if (generalChannel && generalChannel.type === ChannelType.GuildText) {
            await generalChannel.send(`${member} has been unbanished for good behavior, welcome back!`)
        } else {
            logger.warn(`Could not find or send message to general channel (ID: ${GENERAL_CHANNEL_ID})`)
        }
    } catch (e) {
        logger.warn(`Error sending message to general channel: ${red((e as Error).message)}`)
    }

    return `Success: User ${member.user.username} has been unbanished.`
}

const unbanishTool: DynamicStructuredTool<typeof schema> = tool(unbanishUser, {
    name: 'unbanish',
    description: 'Removes the "banished" role from a server member, restoring their access. This is a form of server moderation.',
    schema
})
export default unbanishTool

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
