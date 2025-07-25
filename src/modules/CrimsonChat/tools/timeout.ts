import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | timeout()')

import { z } from 'zod'
import { tool } from 'ai'
import { client as client } from '../../../'
import { findMember } from '../../../util/functions'

const schema = z.object({
    username: z.string().optional(),
    displayname: z.string().optional().describe("Discord display name; the least accurate, performs a closest match search"),
    length: z.number().describe('Length of the timeout in milliseconds').min(5000).max(40320000),
    reason: z.string().optional().describe("Optional reason for the timeout - for moderators' convenience")
})
type Input = z.infer<typeof schema>

async function invoke({ username, displayname, length, reason }: Input): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ username, displayname, length, reason }))}`)
    const query = username ?? displayname
    if (!query) {
        logger.info('No query determined')
        return JSON.stringify({ status: 'error', message: 'must provide either user id, username, or display name' })
    }
    const guild = await client.guilds.fetch('958518067690868796')
    const member = await findMember(guild, query).catch(err => {
        logger.info(`Error while running the findMember() function: ${red(err)}`)
        return `Error: Could not find a member due to a \`findMember()\` runtime error: ${err}`
    })
    if (typeof member === 'string') return JSON.stringify({ status: 'error', message: member })
    if (!member) {
        logger.info('No member found matching the query')
        return JSON.stringify({ status: 'error', message: 'Did not find any member matching the query (either ID, username, or display name); probable cause is too far of a levenshtein distance for display name, or invalid ID or username.' })
    }
    logger.debug(`Member found: ${yellow(member.user.username)}`)
    if (member.user.bot) {
        logger.info('Attempted to time out a bot')
        return JSON.stringify({ status: 'error', message: `Cannot moderate a bot. (Attempted action on: ${member.user.username})` })
    }
    if (!member.moderatable) {
        logger.info('User cannot be moderated')
        return JSON.stringify({ status: 'error', message: `Cannot moderate this user. (Attempted action on: ${member.user.username})` })
    }
    logger.info(`Timing out ${yellow(member.user.username)} for ${yellow(length)}ms with reason "${yellow(reason)}"`)
    await member.timeout(length, reason)
    return JSON.stringify({ status: 'success', message: `Timed out user ${member.user.username} (display name ${member.displayName}) for ${length} milliseconds` })
}

export default tool({
    description: 'Timeout a discord user',
    parameters: schema,
    execute: invoke
})
