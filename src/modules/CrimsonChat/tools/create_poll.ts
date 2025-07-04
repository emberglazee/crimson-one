import { Logger, red, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | create_poll()')

import { z } from 'zod'
import { tool } from 'ai'
import { client as client } from '../../..'
import { ChannelType, PollLayoutType } from 'discord.js'

const CHANNEL_ID = '1335992675459141632'

const answerSchema = z.object({
    text: z.string().min(1).max(55)
})

const schema = z.object({
    question: z.string().min(1).max(255),
    answers: z.array(answerSchema).min(2).max(10),
    duration: z.number().min(1).max(168).optional().describe('Duration of the poll in hours. Defaults to 24.'),
    allowMultiselect: z.boolean().optional().describe('Whether to allow multiple answers. Defaults to false.')
})

type Input = z.infer<typeof schema>

async function invoke({ question, answers, duration = 24, allowMultiselect = false }: Input): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ question, answers, duration, allowMultiselect }))}`)

    try {
        const channel = await client.channels.fetch(CHANNEL_ID)
        if (!channel || channel.type !== ChannelType.GuildText) {
            return `Error: Channel with ID "${CHANNEL_ID}" not found or is not a text channel.`
        }

        const pollOptions = {
            question: { text: question },
            answers: answers,
            duration: duration,
            allowMultiselect: allowMultiselect,
            layoutType: PollLayoutType.Default
        }

        const message = await channel.send({ poll: pollOptions })

        return `Success: Poll created with message ID ${message.id}.`
    } catch (e) {
        const error = e as Error
        logger.error(`Failed to create poll: ${red(error.stack ?? error.message)}`)
        return `Error: An internal error occurred while trying to create the poll: ${error.message}`
    }
}

export default tool({
    description: "Creates a new poll in the primary CrimsonChat channel.",
    parameters: schema,
    execute: invoke
})
