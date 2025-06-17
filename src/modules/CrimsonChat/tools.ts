import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | ToolManager')

import { readdir } from 'fs/promises'
import path from 'path'
import type { Tool } from 'ai'
import { z } from 'zod'

let loadedTools: Record<string, Tool<z.ZodObject<Record<string, z.ZodTypeAny>>>> | null = null

export async function loadTools(): Promise<Record<string, Tool<z.ZodObject<Record<string, z.ZodTypeAny>>>>> {
    if (loadedTools !== null) {
        return loadedTools
    }

    const tools: Record<string, Tool<z.ZodObject<Record<string, z.ZodTypeAny>>>> = {}
    const toolsDir = path.join(__dirname, 'tools')
    try {
        const files = await readdir(toolsDir)

        for (const file of files) {
            // We are running under Bun, don't bother with Javascript
            if (file.endsWith('.ts')) {
                try {
                    const toolModule = await import(path.join(toolsDir, file))
                    const toolDefinition = toolModule.default as Tool<z.ZodObject<Record<string, z.ZodTypeAny>>>
                    const toolName = path.basename(file, '.ts')

                    if (toolDefinition && toolDefinition.parameters && toolDefinition.execute) {
                        tools[toolName] = toolDefinition
                        logger.ok(`Loaded tool: ${yellow(toolName)}`)
                    } else {
                        logger.warn(`File ${file} does not export a valid AI SDK tool.`)
                    }
                } catch (error) {
                    logger.warn(`Failed to load tool from ${file}: ${red(error)}`)
                }
            }
        }
    } catch (error) {
        logger.warn(`Could not read tools directory at ${toolsDir}: ${red(error)}`)
    }

    loadedTools = tools
    return loadedTools
}
