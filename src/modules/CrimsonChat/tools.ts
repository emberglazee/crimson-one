import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | ToolManager')

import { Tool } from '@langchain/core/tools'
import { readdir } from 'fs/promises'
import path from 'path'
import type { ChatGoogleGenerativeAI } from '@langchain/google-genai'

// New: A map to hold our tools for easy lookup
export const toolMap = new Map<string, Tool>()

export async function addTools<T extends ChatGoogleGenerativeAI>(model: T): Promise<T> {
    const tools: Tool[] = []
    const toolsDir = path.join(__dirname, 'tools')
    try {
        const files = await readdir(toolsDir)
        for (const file of files) {
            // We are running under Bun, don't bother with Javascript
            if (file.endsWith('.ts')) {
                try {
                    const toolModule = await import(path.join(toolsDir, file))
                    const toolDef = toolModule.default as Tool
                    if (toolDef && toolDef.name) {
                        tools.push(toolDef)
                        toolMap.set(toolDef.name, toolDef) // Add the tool to our map
                        logger.ok(`Loaded tool: ${yellow(toolDef.name)}`)
                    }
                } catch (error) {
                    logger.warn(`Failed to load tool from ${file}: ${red(error)}`)
                }
            }
        }
    } catch (error) {
        logger.warn(`Could not read tools directory at ${toolsDir}: ${red(error)}`)
    }

    if (tools.length > 0) {
        model.bindTools(tools, {
            tool_choice: 'auto'
        })
    }

    return model
}
