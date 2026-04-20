import { Logger } from '../../Logger'
import { yellow } from '../../../util/colors'
const logger = new Logger('CrimsonChat | xmlParser')

export interface ParsedToolCall {
    toolName: string
    args: Record<string, string>
    raw: string
}

export interface ParsedAIResponse {
    normalText: string
    toolCalls: ParsedToolCall[]
}

/**
 * Parses the raw AI response text, separating the conversational part (normalText)
 * from the tool call XML blocks.
 * @param responseText The raw text output from the AI model.
 * @returns An object containing the normal text and an array of parsed tool calls.
 */
export function parseAIResponse(responseText: string): ParsedAIResponse {
    const toolCallPattern = /<tool:\w+>/s
    const match = responseText.match(toolCallPattern)

    if (!match || match.index === undefined) {
        // No tool calls found, the entire response is normal text
        return { normalText: responseText.trim(), toolCalls: [] }
    }

    const toolCallStartIndex = match.index
    const normalText = responseText.slice(0, toolCallStartIndex).trim()
    const toolCallsText = responseText.slice(toolCallStartIndex)

    const toolCalls = parseToolCalls(toolCallsText)

    return { normalText, toolCalls }
}

/**
 * Parses a string containing one or more tool call XML blocks in the format <tool:tool_name>...</tool:tool_name>.
 * @param toolCallsText The string containing only the tool call XML.
 * @returns An array of parsed tool call objects.
 */
function parseToolCalls(toolCallsText: string): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = []
    const toolRegex = /<tool:(\w+)>([\s\S]*?)<\/tool:\1>/g
    let match

    while ((match = toolRegex.exec(toolCallsText)) !== null) {
        const raw = match[0]
        const toolName = match[1]
        const innerContent = match[2].trim()

        const args: Record<string, string> = {}
        const argRegex = /<(\w+)>([\s\S]*?)<\/\1>/gs
        let argMatch
        while ((argMatch = argRegex.exec(innerContent)) !== null) {
            const argName = argMatch[1]
            const argValue = argMatch[2].trim()
            args[argName] = argValue
        }
        logger.info(`Parsed tool call: ${yellow(toolName)} with args: ${yellow(JSON.stringify(args))}`)
        toolCalls.push({ toolName, args, raw })
    }

    return toolCalls
}


/**
 * Strips all tool call XML blocks from a response string.
 * @param responseText The raw text output from the AI model.
 * @returns The text with all tool call blocks removed.
 */
export function stripToolCalls(responseText: string): string {
    const toolRegex = /<tool:\w+>[\s\S]*?<\/tool:\w+>/g
    return responseText.replace(toolRegex, '').trim()
}
