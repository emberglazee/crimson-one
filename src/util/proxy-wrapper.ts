// src/util/proxy-wrapper.ts

import { setGlobalDispatcher, getGlobalDispatcher, ProxyAgent } from 'undici'
import { Logger } from './logger'

const logger = new Logger('ProxyWrapper')

export async function withProxy<T>(
    operation: () => Promise<T>,
    proxyUrl?: string
): Promise<T> {
    if (!proxyUrl) {
        return operation()
    }

    const originalDispatcher = getGlobalDispatcher()
    const proxyAgent = new ProxyAgent({ uri: proxyUrl })

    logger.debug('Activating temporary proxy for API call...')

    try {
        setGlobalDispatcher(proxyAgent)

        const result = await operation()
        return result
    } finally {
        setGlobalDispatcher(originalDispatcher)
        logger.debug('Deactivated temporary proxy.')
    }
}
