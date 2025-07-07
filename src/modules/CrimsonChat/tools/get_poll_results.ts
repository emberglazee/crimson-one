import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | get_poll_results()')

import { z } from 'zod'
import { tool } from 'ai'
import { client as client } from '../../..'
import { ChannelType } from 'discord.js'

const CHANNEL_ID = '1335992675459141632'

const schema = z.object({
    messageId: z.string().describe('The ID of the message containing the poll.')
})

type Input = z.infer<typeof schema>

async function invoke({ messageId }: Input): Promise<string> {
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
            const questionAnswer = message.poll!.answers.find(a => a.id === answer.id)
            return `- ${questionAnswer?.text}: ${answer.voteCount} votes`
        }).join('\n')

        return JSON.stringify({ status: 'success', message: `Poll results for message ID ${messageId}:\n${results}` })
    } catch (e) {
        const error = e as Error
        logger.error(`Failed to get poll results: ${red(error.stack ?? error.message)}`)
        return JSON.stringify({ status: 'error', message: `An internal error occurred while trying to get poll results: ${error.message}` })
    }
}

export default tool({
    description: "Retrieves the current results of a poll in the primary CrimsonChat channel.",
    parameters: schema,
    execute: invoke
})
