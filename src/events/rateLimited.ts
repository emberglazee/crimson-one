import { Logger, yellow } from '../util/logger'
const logger = new Logger('event.rateLimited')

import type { Client } from 'discord.js'

export default function onRateLimited(client: Client) {
    client.rest.on('rateLimited', rateLimitInfo => {
        logger.warn(
            'REST rate limit!\n'+
            `  Timeout:     ${yellow(rateLimitInfo.sublimitTimeout)}\n`+
            `  Limit:       ${yellow(rateLimitInfo.limit)}\n`+
            `  Method:      ${yellow(rateLimitInfo.method)}\n`+
            `  Retry after: ${yellow(rateLimitInfo.retryAfter)}`
        )
    })
}
