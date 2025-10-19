import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | get_poll_results()')

import { type Client, ChannelType } from 'discord.js'
import type { CrimsonTool } from '../types'

const CHANNEL_ID = '1335992675459141632'

async function invoke({ messageId }: { messageId: string }, { client }: { client: Client }): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ messageId }))}`)

    try {
        const channel = await client.channels.fetch(CHANNEL_ID)
        if (!channel || channel.type !== ChannelType.GuildText) {
            return JSON.stringify({ status: 'error', message: `Channel with ID "${CHANNEL_ID}" not found or is not a text channel.` })
        }

        const message = await channel.messages.fetch(messageId)

        if (!message || !message.poll) {
            return JSON.stringify({ status: 'error', message: `Message with ID ${messageId} does not contain a poll.` })
        }

        const results = message.poll.answers.map(answer => {
            return `- ${answer.text}: ${answer.voteCount} votes`
        }).join('\n')

        return JSON.stringify({ status: 'success', message: `Poll results for message ID ${messageId}:\n${results}` })
    } catch (e) {
        const error = e as Error
        logger.error(`Failed to get poll results: ${red(error.stack ?? error.message)}`)
        return JSON.stringify({ status: 'error', message: `An internal error occurred while trying to get the poll results: ${error.message}` })
    }
}

export default {
    name: 'get_poll_results',
    description: 'Retrieves the current results of a poll in the primary CrimsonChat channel.',
    parameters: [
        {
            name: 'messageId',
            type: 'string',
            description: 'The ID of the message containing the poll.',
            required: true
        }
    ],
    execute: invoke
} as CrimsonTool
