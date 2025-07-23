import { Logger, red, yellow } from './util/logger'
const logger = new Logger('Guardian')

import { spawn } from 'bun'
import { fork, type ChildProcess } from 'child_process'
import path from 'path'

let botProcess: ChildProcess | null = null
let lastKnownGoodCommit = ''
let restartAttempts = 0
let isReady = false
const MAX_RESTART_ATTEMPTS = 3

async function getCommitHash(): Promise<string> {
    const proc = spawn(['git', 'rev-parse', 'HEAD'])
    return (await new Response(proc.stdout).text()).trim()
}

async function startBot() {
    if (botProcess) {
        logger.warn('A bot process is already running. It will be killed.')
        botProcess.kill()
        botProcess = null
    }

    isReady = false
    const currentCommit = await getCommitHash()
    logger.info(`Starting bot on commit ${yellow(currentCommit)}...`)

    const botScriptPath = path.join(__dirname, 'index.ts')
    botProcess = fork(botScriptPath, [], {
        // 'pipe' ensures stdout/stderr are streams we can read
        // 'ipc' is crucial for process.send() to work
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })

    if (botProcess.stdout) {
        botProcess.stdout.pipe(process.stdout)
    }
    if (botProcess.stderr) {
        botProcess.stderr.pipe(process.stderr)
    }

    logger.ok(`Bot process spawned with PID: ${botProcess.pid}`)

    botProcess.on('message', (message: { type: string; [key: string]: unknown }) => {
        handleBotMessage(message)
    })

    botProcess.on('exit', async (code: number | null) => {
        logger.error(`Bot process exited with code: ${red(code)}`)
        botProcess = null
        if (code !== 0) {
            await handleCrash(currentCommit)
        }
    })

    setTimeout(() => {
        // If it's still running but hasn't sent 'READY'
        if (botProcess && (!botProcess.killed && !isReady)) {
            logger.error("Bot did not send 'READY' signal within 30 seconds. Assuming startup failure.")
            botProcess.kill()
        }
    }, 30000)
}

async function handleBotMessage(message: { type: string }) {
    if (message.type === 'UPDATE_REQUEST') {
        logger.info('Received update request from bot. Initiating update...')
        await performUpdate()
    } else if (message.type === 'READY') {
        logger.ok('Bot has signaled it is ready!')
        lastKnownGoodCommit = await getCommitHash()
        restartAttempts = 0
        isReady = true
    }
}

async function performUpdate() {
    logger.info('Killing current bot process for update...')
    if (botProcess) {
        botProcess.removeAllListeners('exit')
        const waitForExit = new Promise<void>(resolve => botProcess!.on('exit', (code: number | null) => {
            logger.info(`Bot exited during update with code: ${code}`)
            resolve()
        }))
        botProcess.kill()
        await waitForExit
        isReady = false
        botProcess = null
    }

    try {
        logger.info('Running "git pull"...')
        const gitPull = spawn(['git', 'pull'])
        await gitPull.exited

        logger.info('Running "bun install"...')
        const bunInstall = spawn(['bun', 'install'])
        await bunInstall.exited

        logger.ok('Update successful. Restarting bot...')
        restartAttempts = 0
        await startBot()

    } catch (error) {
        logger.error(`Update failed: ${red(error)}. Attempting to restart with old code...`)
        await startBot()
    }
}

async function handleCrash(crashedCommit: string) {
    restartAttempts++
    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
        logger.error(`Bot has crashed ${MAX_RESTART_ATTEMPTS} times. Attempting rollback.`)

        if (crashedCommit === lastKnownGoodCommit) {
            logger.error('Crashed on the last known good commit. Cannot roll back. Halting.')
            return
        }

        try {
            logger.warn(`Rolling back to last known good commit: ${yellow(lastKnownGoodCommit)}`)
            const gitReset = spawn(['git', 'reset', '--hard', lastKnownGoodCommit])
            await gitReset.exited

            logger.info('Rollback complete. Attempting to restart...')
            restartAttempts = 0
            await startBot()

        } catch (error) {
            logger.error(`GIT ROLLBACK FAILED: ${red(error)}. Halting.`)
        }
    } else {
        logger.warn(`Crash detected. Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS}...`)
        setTimeout(() => startBot(), 5000)
    }
}

(async () => {
    lastKnownGoodCommit = await getCommitHash()
    await startBot()
})()
