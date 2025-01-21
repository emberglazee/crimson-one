import { EventEmitter } from 'tseep'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import url from 'url'
const esmodules = !!import.meta.url

export class Logger extends EventEmitter<{
    error: (data: JSONResolvable) => void
    warn: (data: JSONResolvable) => void
    info: (data: JSONResolvable) => void
    ok: (data: JSONResolvable) => void
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
        console.log(logoutput('err', data, this.module, true))
        this.emit('error', logoutput('err', data, this.module))
        this.writeLogLine(logoutput('err', data, this.module))
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
    static new(module?: string): Logger {
        return new Logger(module)
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
function logoutput(level: 'err' | 'warn' | 'info' | 'ok', data: JSONResolvable, module?: string, formatting = false) {
    let str = ''
    const displayLevelsColored = {
        'err' : chalk.red(' err'),
        'warn': chalk.yellow('warn'),
        'info': chalk.cyan('info'),
        'ok'  : chalk.green('  ok')
    }
    const displayLevels = {
        'err' : ' err',
        'warn': 'warn',
        'info': 'info',
        'ok'  : '  ok'
    }
    if (module) str += `${formatDate()} - ${formatting ? displayLevelsColored[level] : displayLevels[level]}: [${module}]`
    else str += `${formatDate()} - ${formatting ? displayLevelsColored[level] : displayLevels[level]}:`
    if (typeof data === 'string') str += ` ${data}`
    else str += ` ${JSON.stringify(data)}`
    return str
}

type JSONResolvable = string | number | boolean | {[key: string]: JSONResolvable} | {[key: string]: JSONResolvable}[] | null