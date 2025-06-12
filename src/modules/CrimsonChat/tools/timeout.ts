import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { z } from 'zod'
import { bot as client } from '../../../'
import { distance } from 'fastest-levenshtein'
import type { Guild, GuildMember } from 'discord.js'

const schema = z.object({
    id: z.string().optional().describe('Discord user ID; most accurate and pinpoint'),
    username: z.string().optional(),
    displayname: z.string().optional().describe("Discord display name; the least accurate, performs a closest match search"),
    length: z.number().describe('Length of the timeout in milliseconds'),
    reason: z.string().optional().describe("Optional reason for the timeout - for moderators' convenience")
})
type Input = z.infer<typeof schema>

async function timeoutUser({ id, username, displayname, length, reason }: Input) {
    const query = id ?? username ?? displayname
    if (!query) return 'Error: must provide either user id, username, or display name'
    const guild = await client.guilds.fetch('958518067690868796')
    const member = await findMember(guild, query).catch(err => {
        return `Error: Could not find a member due to a \`findMember()\` runtime error: ${err}`
    })
    if (typeof member === 'string') return member
    if (!member) return `Error: Did not find any member matching the query (either ID, username, or display name); probable cause is too far of a levenshtein distance for display name, or invalid ID or username.`
    if (member.user.bot) return `Error: Cannot moderate a bot. (Attempted action on: ${member.user.username})`
    if (!member.moderatable) return `Error: Cannot moderate this user. (Attempted action on: ${member.user.username})`
    await member.timeout(length, reason)
    return `✅ Successfully timed out user ${member.user.username} (display name ${member.displayName}) for ${length} milliseconds`
}

const timeoutTool: DynamicStructuredTool<typeof schema> = tool(timeoutUser, {
    name: 'timeout',
    description: 'Timeout a discord user',
    schema
})
export default timeoutTool

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
    let closestMatch = null
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
