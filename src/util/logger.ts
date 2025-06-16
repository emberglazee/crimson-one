import { EventEmitter } from 'tseep'
import type { JSONResolvable } from '../types'
import fs from 'fs'
import path from 'path'
import url from 'url'

import chalk from 'chalk'
// Force colors to be enabled
chalk.level = 2
// Shortcut for using chalk colors alongside logger
export const { yellow, red, cyan, green, blue } = chalk

const esmodules = !!import.meta.url

export class Logger extends EventEmitter<{
    error: (data: JSONResolvable) => void
    warn: (data: JSONResolvable) => void
    info: (data: JSONResolvable) => void
    ok: (data: JSONResolvable) => void
    debug: (data: JSONResolvable) => void
}> {
    file = ''
    useWebhook = false
    module: string | undefined
    constructor(module?: string) {
        super()
        this._createLogFile()
        if (process.env.DISCORD_WEBHOOK_TOKEN) {
            this.useWebhook = true
        }
        this.module = module
    }
    private _log(level: 'error' | 'warn' | 'info' | 'ok' | 'debug', data: JSONResolvable) {
        console.log(logoutput(level, data, this.module, true))
        this.emit(level, logoutput(level, data, this.module))
        this.writeLogLine(logoutput(level, data, this.module))
    }

    error(data: JSONResolvable) {
        this._log('error', data)
    }
    warn(data: JSONResolvable) {
        this._log('warn', data)
    }
    info(data: JSONResolvable) {
        this._log('info', data)
    }
    ok(data: JSONResolvable) {
        this._log('ok', data)
    }
    debug(data: JSONResolvable) {
        this._log('debug', data)
    }

    _createLogFile(date = formatDate()) {
        const logsPath = path.join(esmodules ? path.dirname(url.fileURLToPath(import.meta.url)) : __dirname, '../../logs')
        if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath)
        const logFile = path.join(logsPath, `${date}.log`)
        fs.writeFileSync(logFile, '')
        this.file = logFile
        return logFile
    }
    writeLogLine(str: string) {
        fs.appendFileSync(this.file, `${str}\n`)
    }
}
export function formatDate() {
    const d = new Date()
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: 'Europe/Moscow',
        hour12: false
    }
    return `${d.toLocaleDateString('ru-RU', opts).replace(/\//g, '.')}-${d.toLocaleTimeString('ru-RU', opts).replace(/:/g, '.')}`
}
function logoutput(level: 'error' | 'warn' | 'info' | 'ok' | 'debug', data: JSONResolvable, module?: string, formatting = false) {
    let str = ''
    const displayLevelsColored = {
        'error': red('error'),
        'warn' : yellow(' warn'),
        'info' : cyan(' info'),
        'ok'   : green('   ok'),
        'debug': blue('debug')
    }
    const displayLevels = {
        'error': 'error',
        'warn' : ' warn',
        'info' : ' info',
        'ok'   : '   ok',
        'debug': 'debug'
    }
    if (module) str += `${formatDate()} - ${formatting ? displayLevelsColored[level] : displayLevels[level]}: [${module}]`
    else str += `${formatDate()} - ${formatting ? displayLevelsColored[level] : displayLevels[level]}:`
    if (typeof data === 'string') str += ` ${data}`
    else str += ` ${JSON.stringify(data)}`
    return str
}
