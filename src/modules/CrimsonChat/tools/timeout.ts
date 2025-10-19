import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | timeout()')

import { type Client } from 'discord.js'
import { findMember } from '../../../util/functions'
import { SOLITARY_CONFINEMENT_GUILD_ID } from '../../../util/constants'
import type { CrimsonTool } from '../types'

async function invoke({ username, displayname, length, reason }: {
    username?: string
    displayname?: string
    length: number
    reason?: string
}, { client }: { client: Client }): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ username, displayname, length, reason }))}`)
    const query = username ?? displayname
    if (!query) {
        logger.info('No query determined')
        return JSON.stringify({ status: 'error', message: 'You must provide either a user ID, username, or display name.' })
    }
    const guild = await client.guilds.fetch(SOLITARY_CONFINEMENT_GUILD_ID)
    const member = await findMember(guild, query).catch(err => {
        logger.info(`Error while running the findMember() function: ${red(err)}`)
        return `Error: Could not find a member due to a findMember() runtime error: ${err}`
    })
    if (typeof member === 'string') return JSON.stringify({ status: 'error', message: member })
    if (!member) {
        logger.info('No member found matching the query')
        return JSON.stringify({ status: 'error', message: 'No member was found matching the query (ID, username, or display name). This is likely due to a large Levenshtein distance for the display name, or an invalid ID or username.' })
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

export default {
    name: 'timeout',
    description: 'Times out a Discord user.',
    parameters: [
        {
            name: 'username',
            type: 'string',
            description: 'The user\'s global Discord username (e.g., "johndoe")',
            required: false
        },
        {
            name: 'displayname',
            type: 'string',
            description: 'Discord display name; the least accurate, performs a closest match search',
            required: false
        },
        {
            name: 'length',
            type: 'number',
            description: 'Length of the timeout in milliseconds. Minimum 5000, maximum 40320000.',
            required: true
        },
        {
            name: 'reason',
            type: 'string',
            description: "Optional reason for the timeout - for moderators' convenience",
            required: false
        }
    ],
    execute: invoke
} as CrimsonTool
