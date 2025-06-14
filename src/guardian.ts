// guardian.ts
import { spawn } from 'bun'
import { fork, type ChildProcess } from 'child_process' // <-- Import fork and ChildProcess
import path from 'path'
import { Logger, red, yellow } from './util/logger'

const logger = new Logger('Guardian')

let botProcess: ChildProcess | null = null // <-- Use ChildProcess type
let lastKnownGoodCommit = ''
let restartAttempts = 0
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

    const currentCommit = await getCommitHash()
    logger.info(`Starting bot on commit ${yellow(currentCommit)}...`)

    const botScriptPath = path.join(__dirname, 'index.ts')
    botProcess = null
    botProcess = fork(botScriptPath, [], {
        // 'pipe' ensures stdout/stderr are streams we can read
        // 'ipc' is crucial for process.send() to work
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })

    // --- Cleaner stream piping ---
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

    // Set a timeout for the 'READY' signal
    setTimeout(() => {
        // If it's still running but hasn't sent 'READY'
        if (botProcess && !botProcess.killed) {
            logger.error("Bot did not send 'READY' signal within 30 seconds. Assuming startup failure.")
            botProcess.kill()
        }
    }, 30000) // 30-second timeout
}

// Function to handle messages received from the child process
async function handleBotMessage(message: { type: string }) {
    if (message.type === 'UPDATE_REQUEST') {
        logger.info('Received update request from bot. Initiating update...')
        await performUpdate()
    } else if (message.type === 'READY') {
        logger.ok('Bot has signaled it is ready!')
        lastKnownGoodCommit = await getCommitHash() // Update the known good commit
        restartAttempts = 0 // Reset crash counter on successful start
    }
}

async function performUpdate() {
    logger.info('Killing current bot process for update...')
    if (botProcess) {
        // Set up a promise to wait for the exit event
        const waitForExit = new Promise<void>(resolve => botProcess!.on('exit', () => resolve()))
        botProcess.kill()
        await waitForExit // Wait for it to fully exit
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
        restartAttempts = 0 // Reset crash counter after a manual update
        await startBot()

    } catch (error) {
        logger.error(`Update failed: ${red(error)}. Attempting to restart with old code...`)
        await startBot() // Restart with whatever code is there
    }
}

async function handleCrash(crashedCommit: string) {
    restartAttempts++
    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
        logger.error(`Bot has crashed ${MAX_RESTART_ATTEMPTS} times. Attempting rollback.`)

        if (crashedCommit === lastKnownGoodCommit) {
            logger.error('Crashed on the last known good commit. Cannot roll back. Halting.')
            return // Stop trying
        }

        try {
            logger.warn(`Rolling back to last known good commit: ${yellow(lastKnownGoodCommit)}`)
            const gitReset = spawn(['git', 'reset', '--hard', lastKnownGoodCommit])
            await gitReset.exited

            logger.info('Rollback complete. Attempting to restart...')
            restartAttempts = 0 // Reset counter after rollback
            await startBot()

        } catch (error) {
            logger.error(`GIT ROLLBACK FAILED: ${red(error)}. Halting.`)
        }
    } else {
        logger.warn(`Crash detected. Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS}...`)
        setTimeout(() => startBot(), 5000) // Wait 5 seconds before restarting
    }
}


// Initial start
(async () => {
    lastKnownGoodCommit = await getCommitHash()
    await startBot()
})()
