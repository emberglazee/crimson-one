import { EventEmitter } from 'tseep'
import type { JSONResolvable } from '../types/types'
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
    error(data: JSONResolvable) {
        console.log(logoutput('error', data, this.module, true))
        this.emit('error', logoutput('error', data, this.module))
        this.writeLogLine(logoutput('error', data, this.module))
    }
    warn(data: JSONResolvable) {
        console.log(logoutput('warn', data, this.module, true))
        this.emit('warn', logoutput('warn', data, this.module))
        this.writeLogLine(logoutput('warn', data, this.module))
    }
    info(data: JSONResolvable) {
        console.log(logoutput('info', data, this.module, true))
        this.emit('info', logoutput('info', data, this.module))
        this.writeLogLine(logoutput('info', data, this.module))
    }
    ok(data: JSONResolvable) {
        console.log(logoutput('ok', data, this.module, true))
        this.emit('ok', logoutput('ok', data, this.module))
        this.writeLogLine(logoutput('ok', data, this.module))
    }
    debug(data: JSONResolvable) {
        console.log(logoutput('debug', data, this.module, true))
        this.emit('debug', logoutput('debug', data, this.module))
        this.writeLogLine(logoutput('debug', data, this.module))
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
