import { Logger } from '../../Logger'
import { yellow, red } from '../../../util/colors'
const logger = new Logger('CrimsonChat | create_poll()')

import { type Client, ChannelType, PollLayoutType } from 'discord.js'
import type { CrimsonTool } from '../types'

const CHANNEL_ID = '1335992675459141632'

async function invoke({ question, answers, duration = 24, allowMultiselect = false }: {
    question: string
    answers: string
    duration?: number
    allowMultiselect?: boolean
}, { client }: { client: Client }): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ question, answers, duration, allowMultiselect }))}`)

    try {
        const channel = await client.channels.fetch(CHANNEL_ID)
        if (!channel || channel.type !== ChannelType.GuildText) {
            return JSON.stringify({ status: 'error', message: `The channel with the ID "${CHANNEL_ID}" was not found or is not a text channel.` })
        }

        const answerObjects = answers.split(',').map(ans => ({ text: ans.trim() }))
        if (answerObjects.length < 2 || answerObjects.length > 10) {
            return JSON.stringify({ status: 'error', message: 'Poll must have between 2 and 10 answers.' })
        }

        const pollOptions = {
            question: { text: question },
            answers: answerObjects,
            duration: duration,
            allowMultiselect: allowMultiselect,
            layoutType: PollLayoutType.Default
        }

        const message = await channel.send({ poll: pollOptions })

        return JSON.stringify({ status: 'success', message: `Poll created with message ID ${message.id}.` })
    } catch (e) {
        const error = e as Error
        logger.error(`Failed to create poll: ${red(error.stack ?? error.message)}`)
        return JSON.stringify({ status: 'error', message: `An internal error occurred while trying to create the poll: ${error.message}` })
    }
}

export default {
    name: 'create_poll',
    description: 'Creates a new poll in the primary CrimsonChat channel.',
    parameters: [
        { name: 'question', type: 'string', description: 'The question for the poll.', required: true },
        { name: 'answers', type: 'string', description: 'A comma-separated list of answers for the poll (e.g., "Answer 1,Answer 2,Answer 3").', required: true },
        { name: 'duration', type: 'number', description: 'Duration of the poll in hours. Defaults to 24.', required: false },
        { name: 'allowMultiselect', type: 'boolean', description: 'Whether to allow multiple answers. Defaults to false.', required: false }
    ],
    execute: invoke
} as CrimsonTool
