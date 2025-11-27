import { resolve } from 'path'
import { Logger } from './modules'
import { promises as fs } from 'fs'

const isMainModule = Bun.main === import.meta.path

const logger = new Logger('Init')

const paths = {
    dotenv: resolve('./.env'),
    exampleDotenv: resolve('./.env.example'),
    crimsonchatState: resolve('./data/crimsonchat_state.toon'),
    messageTriggers: resolve('./data/message_triggers.ts'),
    timedBanishments: resolve('./data/timed-banishments.json'),
    initIndicator: resolve('./data/.initialized')
}

if (isMainModule) {
    logger.info('Running me directly? Fine, I don\'t recommend this but you do you.')
    if (await fs.stat(paths.initIndicator).catch(() => false)) {
        logger.ok(`Already initialized, exiting. Delete ${paths.initIndicator} to re-run initialization.`)
        process.exit(0)
    }
}

if (!await fs.stat(paths.crimsonchatState).catch(() => false)) {
    logger.info(`${paths.crimsonchatState} is missing, creating...`)
    await fs.writeFile(paths.crimsonchatState, '')
    logger.ok(`${paths.crimsonchatState} created`)
}
if (!await fs.stat(paths.messageTriggers).catch(() => false)) {
    logger.info(`${paths.messageTriggers} is missing, creating...`)
    const content = (
        'import { MessageTriggerEntry } from \'../src/types\'\n\n' +
        'export default [] as MessageTriggerEntry[]\n'
    )
    await fs.writeFile(paths.messageTriggers, content)
    logger.ok(`${paths.messageTriggers} created`)
}
if (!await fs.stat(paths.timedBanishments).catch(() => false)) {
    logger.info(`${paths.timedBanishments} is missing, creating...`)
    await fs.writeFile(paths.timedBanishments, '[]')
    logger.ok(`${paths.timedBanishments} created`)
}

if (!await fs.stat(paths.dotenv).catch(() => false)) {
    logger.info(`${paths.dotenv} is missing, creating from the template...`)
    const templatePath = resolve('./.env.example')
    await fs.copyFile(templatePath, paths.dotenv)
    logger.ok(`${paths.dotenv} created from template ${templatePath}.`)
}

await fs.writeFile(paths.initIndicator, '')

if (isMainModule) logger.ok('Done.')
