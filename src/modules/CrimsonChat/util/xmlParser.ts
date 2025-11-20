import { Logger } from '../../Logger'
import { yellow } from '../../../util/colors'
import { getTools } from '../tools'
const logger = new Logger('CrimsonChat | xmlParser')

export interface ParsedToolCall {
    toolName: string
    args: Record<string, any>
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
    const toolNames = Array.from(getTools().keys())
    // Also look for the generic <tool> tag
    const toolCallPattern = new RegExp(`<(?:tool|${toolNames.join('|')})>`, 's')
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
 * Parses a string containing one or more tool call XML blocks.
 * It tries to parse the generic <tool> format first, then falls back to the <tool_name> format.
 * @param toolCallsText The string containing only the tool call XML.
 * @returns An array of parsed tool call objects.
 */
function parseToolCalls(toolCallsText: string): ParsedToolCall[] {
    const toolCalls: ParsedToolCall[] = []
    const toolNames = Array.from(getTools().keys())

    // --- Strategy 1: Handle Format <tool><name>...</name>...</tool> ---
    const genericToolRegex = /<tool>([\s\S]*?)<\/tool>/g
    let match
    const genericToolCalls: ParsedToolCall[] = []

    genericToolRegex.lastIndex = 0
    while ((match = genericToolRegex.exec(toolCallsText)) !== null) {
        const raw = match[0]
        const toolContent = match[1]

        const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(toolContent)
        if (!nameMatch) continue
        const toolName = nameMatch[1].trim()

        const paramsMatch = /<parameters>([\s\S]*?)<\/parameters>/.exec(toolContent)
        const paramsContent = paramsMatch ? paramsMatch[1].trim() : toolContent

        const args: Record<string, any> = {}
        const argRegex = /<(\w+)>([\s\S]*?)<\/\1>/gs
        let argMatch
        while ((argMatch = argRegex.exec(paramsContent)) !== null) {
            const argName = argMatch[1]
            if (argName === 'name') continue // Don't parse the <name> tag as an argument
            const argValue = argMatch[2].trim()
            args[argName] = argValue
        }
        logger.info(`Parsed generic tool call: ${yellow(toolName)} with args: ${yellow(JSON.stringify(args))}`)
        genericToolCalls.push({ toolName, args, raw })
    }

    if (genericToolCalls.length > 0) {
        return genericToolCalls
    }

    // --- Strategy 2: Fallback to <tool_name>...</tool_name> format ---
    if (toolNames.length === 0) return []

    const specificToolRegex = new RegExp(`<(${toolNames.join('|')})>([\\s\\S]*?)</\\1>`, 'g')

    while ((match = specificToolRegex.exec(toolCallsText)) !== null) {
        const raw = match[0]
        const toolName = match[1]
        const innerContent = match[2].trim()
        const args: Record<string, any> = {}
        const argRegex = /<(\w+)>([\s\S]*?)<\/\1>/gs

        let argMatch
        while ((argMatch = argRegex.exec(innerContent)) !== null) {
            const argName = argMatch[1]
            const argValue = argMatch[2].trim()
            args[argName] = argValue
        }
        logger.info(`Parsed specific tool call: ${yellow(toolName)} with args: ${yellow(JSON.stringify(args))}`)
        toolCalls.push({ toolName, args, raw })
    }

    return toolCalls
}

/**
 * Strips all tool call XML blocks from a response string.
 * This is kept for backwards compatibility or for cases where only the text is needed.
 * @param responseText The raw text output from the AI model.
 * @returns The text with all tool call blocks removed.
 */
export function stripToolCalls(responseText: string): string {
    const toolNames = Array.from(getTools().keys())
    if (toolNames.length === 0) return responseText

    const toolRegex = new RegExp(`<(${toolNames.join('|')})>[\\s\\S]*?</\\1>`, 'g')
    return responseText.replace(toolRegex, '').trim()
}
