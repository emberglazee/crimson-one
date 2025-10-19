import { Logger } from '../../Logger'
import { yellow } from '../../../util/colors'
const logger = new Logger('CrimsonChat | xmlParser')

export interface ParsedToolCall {
    toolName: string
    args: Record<string, any>
    raw: string
}

export function parseToolCalls(responseText: string): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = []
    const toolRegex = /<(\w+)>(.*?)<\/\1>/gs

    let match
    while ((match = toolRegex.exec(responseText)) !== null) {
        const toolName = match[1]
        const innerContent = match[2]
        const raw = match[0]

        const args: Record<string, any> = {}
        const argRegex = /<(\w+)>(.*?)<\/\1>/gs

        let argMatch
        while ((argMatch = argRegex.exec(innerContent)) !== null) {
            const argName = argMatch[1]
            const argValue = argMatch[2]
            args[argName] = argValue
        }

        logger.info(`Parsed tool call: ${yellow(toolName)} with args: ${yellow(JSON.stringify(args))}`)
        toolCalls.push({ toolName, args, raw })
    }

    return toolCalls
}

export function stripToolCalls(responseText: string): string {
    return responseText.replace(/<(\w+)>.*?<\/\1>/gs, '').trim()
}
