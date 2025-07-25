import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | banish()')

import { z } from 'zod'
import { tool } from 'ai'
import { client as client } from '../../..'
import { distance } from 'fastest-levenshtein'
import { type Guild, type GuildMember, PermissionsBitField } from 'discord.js'
import { EMBI_ID } from '../../../util/constants'
import { BanishmentManager } from '../../BanishmentManager'
import { parseDuration } from '../../../util/functions'

const GUILD_ID = '958518067690868796'

const schema = z.object({
    username: z.string().optional().describe('The user\'s global Discord username (e.g., "johndoe")'),
    displayname: z.string().optional().describe("The user's display name in the server; the least accurate, performs a closest match search"),
    duration: z.string().optional().describe('Duration of the banishment (e.g., "6d 3h 2m" or a specific date). Default is permanent.'),
    reason: z.string().optional().describe("Optional reason for the banishment for the audit log.")
})
type Input = z.infer<typeof schema>

async function invoke({ username, displayname, duration, reason }: Input): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ username, displayname, duration, reason }))}`)
    const query = username ?? displayname
    if (!query) {
        return JSON.stringify({ status: 'error', message: 'must provide either a username or display name to identify the target.' })
    }

    let guild: Guild
    try {
        guild = await client.guilds.fetch(GUILD_ID)
    } catch (e) {
        logger.error(`Failed to fetch guild ${GUILD_ID}: ${red((e as Error).message)}`)
        return JSON.stringify({ status: 'error', message: 'Internal error, could not find the designated guild.' })
    }

    const botMember = guild.members.me
    if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return JSON.stringify({ status: 'error', message: "I do not have the 'Manage Roles' permission to perform this action." })
    }

    const member = await findMember(guild, query)
    if (!member) {
        return JSON.stringify({ status: 'error', message: `Could not find any member matching the query "${query}".` })
    }

    if (member.id === client.user.id) {
        return JSON.stringify({ status: 'info', message: "You can't make me banish myself. Predictable." })
    }
    if (member.id === EMBI_ID) {
        return JSON.stringify({ status: 'info', message: "I can't banish my creator. This is an invalid order." })
    }
    if (!member.manageable) {
        return JSON.stringify({ status: 'error', message: `I cannot manage this user. They likely have a higher role than me. (Target: ${member.user.username})` })
    }

    const banishmentManager = BanishmentManager.getInstance()
    try {
        const durationSec = duration ? parseDuration(duration) : null
        if (durationSec !== null) {
            if (durationSec < 60n) return JSON.stringify({ status: 'error', message: 'Minimum banishment duration is 1 minute.' })

            const unbanishTimestamp = BigInt(Date.now()) + durationSec * 1000n
            if (unbanishTimestamp > 8.64e15) return JSON.stringify({ status: 'error', message: 'Calculated unbanishment date is beyond `13th of September, year 275760, 12:00:00.000 AM`. wtf is wrong with you' })
        }

        await banishmentManager.banish(member, client.user, 'crimsonchat', duration ?? null, reason ?? 'Banishment issued by Crimson 1.')
        return JSON.stringify({ status: 'success', message: `User ${member.user.username} has been banished.` })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        logger.error(`Banishment failed for ${member.user.username}: ${red(errorMessage)}`)
        return JSON.stringify({ status: 'error', message: `Failed to banish the user. ${errorMessage}` })
    }
}

export default tool({
    description: 'Assigns the "banished" role to a server member, restricting their access. This is a form of server moderation.',
    parameters: schema,
    execute: invoke
})

async function findMember(guild: Guild, query: string): Promise<GuildMember | null> {
    await guild.members.fetch({ query: query, limit: 10 })
    const memberByUsername = guild.members.cache.find(
        member => member.user.username.toLowerCase() === query.toLowerCase()
    )
    if (memberByUsername) return memberByUsername

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
    const threshold = Math.floor(query.length / 2)
    if (closestMatch && smallestDistance <= threshold) {
        return closestMatch
    }

    return null
}
