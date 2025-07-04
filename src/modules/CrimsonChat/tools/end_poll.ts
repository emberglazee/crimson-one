import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | end_poll()')

import { z } from 'zod'
import { tool } from 'ai'
import { client as client } from '../../..'
import { ChannelType } from 'discord.js'

const CHANNEL_ID = '1335992675459141632'

const schema = z.object({
    messageId: z.string().describe('The ID of the message containing the poll to end.')
})

type Input = z.infer<typeof schema>

async function invoke({ messageId }: Input): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ messageId }))}`)

    try {
        const channel = await client.channels.fetch(CHANNEL_ID)
        if (!channel || channel.type !== ChannelType.GuildText) {
            return `Error: Channel with ID "${CHANNEL_ID}" not found or is not a text channel.`
        }

        const message = await channel.messages.fetch(messageId)

        if (!message.poll) {
            return `Error: Message with ID ${messageId} does not contain a poll.`
        }

        if (message.poll.resultsFinalized) {
            return `Information: Poll with message ID ${messageId} is already ended.`
        }

        await message.poll.end()

        return `Success: Poll with message ID ${messageId} has been ended.`
    } catch (e) {
        const error = e as Error
        logger.error(`Failed to end poll: ${red(error.stack ?? error.message)}`)
        return `Error: An internal error occurred while trying to end the poll: ${error.message}`
    }
}

export default tool({
    description: "Ends an ongoing poll in the primary CrimsonChat channel.",
    parameters: schema,
    execute: invoke
})
