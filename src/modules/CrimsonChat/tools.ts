import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | ToolManager')

import { Tool } from '@langchain/core/tools'
import { readdir } from 'fs/promises'
import path from 'path'
import type { ChatOpenAI } from '@langchain/openai'
import type { ChatGoogleGenerativeAI } from '@langchain/google-genai'

export async function addTools<T extends ChatOpenAI | ChatGoogleGenerativeAI>(model: T): Promise<T> {
    const tools: Tool[] = []
    const toolsDir = path.join(__dirname, 'tools')
    try {
        const files = await readdir(toolsDir)
        for (const file of files) {
            if (file.endsWith('.js') || file.endsWith('.ts')) {
                try {
                    const toolModule = await import(path.join(toolsDir, file))
                    const toolDef = toolModule.default as Tool
                    if (toolDef) {
                        tools.push(toolDef)
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
    model.bindTools(tools, {
        tool_choice: 'auto'
    })
    return model
}
