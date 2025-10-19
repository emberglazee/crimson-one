import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | end_poll()')

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

        if (!message.poll) {
            return JSON.stringify({ status: 'error', message: `The message with the ID ${messageId} does not contain a poll.` })
        }

        if (message.poll.resultsFinalized) {
            return JSON.stringify({ status: 'info', message: `Poll with message ID ${messageId} is already ended.` })
        }

        await message.poll.end()

        return JSON.stringify({ status: 'success', message: `Poll with message ID ${messageId} has been ended.` })
    } catch (e) {
        const error = e as Error
        logger.error(`Failed to end poll: ${red(error.stack ?? error.message)}`)
        return JSON.stringify({ status: 'error', message: `An internal error occurred while trying to end the poll: ${error.message}` })
    }
}

export default {
    name: 'end_poll',
    description: 'Ends an ongoing poll in the primary CrimsonChat channel.',
    parameters: [
        {
            name: 'messageId',
            type: 'string',
            description: 'The ID of the message containing the poll to end.',
            required: true
        }
    ],
    execute: invoke
} as CrimsonTool
