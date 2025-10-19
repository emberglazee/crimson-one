import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | unbanish()')

import { container } from 'tsyringe'
import { type Client, type Guild, PermissionsBitField } from 'discord.js'
import { BanishmentManager } from '../../BanishmentManager'
import { findMember } from '../../../util/functions'
import { SOLITARY_CONFINEMENT_GUILD_ID } from '../../../util/constants'
import type { CrimsonTool } from '../types'

const banishmentManager = container.resolve(BanishmentManager)

async function invoke({ username, displayname, reason }: {
    username?: string
    displayname?: string
    reason?: string
}, { client }: { client: Client }): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ username, displayname, reason }))}`)
    const query = username ?? displayname
    if (!query) {
        return JSON.stringify({ status: 'error', message: 'You must provide either a username or display name to identify the target.' })
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

    if (!client.user) {
        return JSON.stringify({ status: 'error', message: 'The bot client is not yet ready.' })
    }

    const member = await findMember(guild, query)
    if (!member) {
        return JSON.stringify({ status: 'error', message: `Could not find any member matching the query "${query}".` })
    }

    if (member.id === client.user.id) {
        return JSON.stringify({ status: 'info', message: 'What did you think was going to happen?' })
    }
    if (!member.manageable) {
        return JSON.stringify({ status: 'error', message: `I cannot manage this user. They likely have a higher role than me. (Target: ${member.user.username})` })
    }

    try {
        await banishmentManager.unbanish(member, client.user, 'crimsonchat', reason ?? 'Unbanishment issued by Crimson 1.')
        return JSON.stringify({ status: 'success', message: `User ${member.user.username} has been unbanished.` })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        logger.error(`Unbanishment failed for ${member.user.username}: ${red(errorMessage)}`)
        return JSON.stringify({ status: 'error', message: `Failed to unbanish the user: ${errorMessage}` })
    }
}

export default {
    name: 'unbanish',
    description: 'Removes the "banished" role from a server member, restoring their access. This is a form of server moderation.',
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
            name: 'reason',
            type: 'string',
            description: 'Optional reason for the unbanishment for the audit log.',
            required: false
        }
    ],
    execute: invoke
} as CrimsonTool
