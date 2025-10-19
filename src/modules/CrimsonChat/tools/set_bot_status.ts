import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | set_bot_status()')

import { type Client, ActivityType, type PresenceStatusData } from 'discord.js'
import type { CrimsonTool } from '../types'

async function invoke({ status, activityType, activityName }: {
    status?: PresenceStatusData
    activityType?: 'Playing' | 'Streaming' | 'Listening' | 'Watching' | 'Competing'
    activityName?: string
}, { client }: { client: Client }): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ status, activityType, activityName }))}`)
    try {
        if (!client || !client.user) {
            logger.error(red('Discord client or user not available.'))
            return JSON.stringify({ status: 'error', message: 'The Discord client is not available.' })
        }

        const presenceOptions: { status?: PresenceStatusData, activities?: { name: string, type: ActivityType }[] } = {}

        if (status) {
            presenceOptions.status = status
        }

        if (activityType && activityName) {
            let discordActivityType: ActivityType | undefined
            switch (activityType) {
                case 'Playing':
                    discordActivityType = ActivityType.Playing
                    break
                case 'Streaming':
                    discordActivityType = ActivityType.Streaming
                    break
                case 'Listening':
                    discordActivityType = ActivityType.Listening
                    break
                case 'Watching':
                    discordActivityType = ActivityType.Watching
                    break
                case 'Competing':
                    discordActivityType = ActivityType.Competing
                    break
            }

            if (discordActivityType !== undefined) {
                presenceOptions.activities = [{ name: activityName, type: discordActivityType }]
            } else {
                logger.warn(yellow(`Invalid activity type provided: ${activityType}`))
            }
        } else if (activityType || activityName) {
            logger.warn(yellow('Both activityType and activityName must be provided to set an activity.'))
            return JSON.stringify({ status: 'error', message: 'Both activityType and activityName must be provided to set an activity.' })
        }

        if (Object.keys(presenceOptions).length === 0) {
            return JSON.stringify({ status: 'error', message: 'No status or activity provided to set.' })
        }

        client.user.setPresence(presenceOptions) // not async

        let responseMessage = 'Bot presence updated: '
        if (status) responseMessage += `Status set to ${status}. `
        if (activityType && activityName) responseMessage += `Activity set to ${activityType} ${activityName}.`

        logger.ok(responseMessage)
        return JSON.stringify({ status: 'success', message: responseMessage })

    } catch (error) {
        logger.error(`Failed to set bot status: ${red(error instanceof Error ? error.message : String(error))}`)
        return JSON.stringify({ status: 'error', message: `Failed to set bot status: ${error instanceof Error ? error.message : String(error)}` })
    }
}

export default {
    name: 'set_bot_status',
    description: 'Sets the Discord bot\'s presence status and activity.',
    parameters: [
        { name: 'status', type: 'string', description: 'The presence status (online, idle, dnd, invisible).', required: false },
        { name: 'activityType', type: 'string', description: 'The type of activity (Playing, Streaming, Listening, Watching, Competing).', required: false },
        { name: 'activityName', type: 'string', description: 'The name of the activity.', required: false }
    ],
    execute: invoke
} as CrimsonTool
