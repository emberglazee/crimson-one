import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | banish()')

import { container } from 'tsyringe'
import { type Client, type Guild, PermissionsBitField } from 'discord.js'
import { EMBI_ID, SOLITARY_CONFINEMENT_GUILD_ID } from '../../../util/constants'
import { BanishmentManager } from '../../BanishmentManager'
import { findMember, parseDuration } from '../../../util/functions'
import type { CrimsonTool } from '../types'

const banishmentManager = container.resolve(BanishmentManager)

async function invoke({ username, displayname, duration, reason }: {
    username?: string
    displayname?: string
    duration?: string
    reason?: string
}, { client }: { client: Client }): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ username, displayname, duration, reason }))}`)
    const query = username ?? displayname
    if (!query) {
        return JSON.stringify({ status: 'error', message: 'You must provide either a username or a display name to identify the target.' })
    }

    let guild: Guild
    try {
        guild = await client.guilds.fetch(SOLITARY_CONFINEMENT_GUILD_ID)
    } catch (e) {
        logger.error(`Failed to fetch guild ${SOLITARY_CONFINEMENT_GUILD_ID}: ${red((e as Error).message)}`)
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

    if (!client.user) {
        return JSON.stringify({ status: 'error', message: 'The bot client is not yet ready.' })
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

    try {
        const durationSec = duration ? parseDuration(duration) : null
        if (durationSec !== null) {
            if (durationSec < 60n) return JSON.stringify({ status: 'error', message: 'Minimum banishment duration is 1 minute.' })

            const unbanishTimestamp = BigInt(Date.now()) + durationSec * 1000n
            if (unbanishTimestamp > 8.64e15) return JSON.stringify({ status: 'error', message: 'The calculated unbanishment date is beyond September 13, 275760. What is wrong with you?' })
        }

        await banishmentManager.banish(member, client.user, 'crimsonchat', duration ?? null, reason ?? 'Banishment issued by Crimson 1.')
        return JSON.stringify({ status: 'success', message: `User ${member.user.username} has been banished.` })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        logger.error(`Banishment failed for ${member.user.username}: ${red(errorMessage)}`)
        return JSON.stringify({ status: 'error', message: `Failed to banish the user. ${errorMessage}` })
    }
}

export default {
    name: 'banish',
    description: 'Assigns the "banished" role to a server member, restricting their access. This is a form of server moderation.',
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
            description: "The user's display name in the server; the least accurate, performs a closest match search",
            required: false
        },
        {
            name: 'duration',
            type: 'string',
            description: 'Duration of the banishment (e.g., "6d 3h 2m" or a specific date). Default is permanent.',
            required: false
        },
        {
            name: 'reason',
            type: 'string',
            description: 'Optional reason for the banishment for the audit log.',
            required: false
        }
    ],
    execute: invoke
} as CrimsonTool
