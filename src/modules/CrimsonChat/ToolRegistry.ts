import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
import { green, yellow, red } from '../../util/colors'
const logger = new Logger('ToolRegistry')

import { readdir } from 'fs/promises'
import path from 'path'
import type { CrimsonTool } from './types'

@singleton()
export class ToolRegistry {
    public readonly tools: Map<string, CrimsonTool> = new Map()

    public async loadTools(dir: string): Promise<void> {
        logger.debug(`{loadTools} Reading tools from ${yellow(dir)}...`)
        const files = await readdir(dir, { withFileTypes: true })

        for (const file of files) {
            const filePath = path.join(dir, file.name)
            if (file.isDirectory()) {
                await this.loadTools(filePath)
            } else if (file.isFile() && file.name.endsWith('.ts')) {
                try {
                    const toolModule = await import(filePath)
                    const toolDefinition = toolModule.default as CrimsonTool

                    if (toolDefinition && toolDefinition.name && toolDefinition.description && toolDefinition.parameters && typeof toolDefinition.execute === 'function') {
                        this.tools.set(toolDefinition.name, toolDefinition)
                        logger.ok(`{loadTools} Loaded tool: ${green(toolDefinition.name)}`)
                    } else {
                        logger.warn(`{loadTools} File ${file.name} does not export a valid CrimsonTool.`)
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error)
                    logger.error(`{loadTools} Failed to load tool from ${file.name}: ${red(errorMessage)}`)
                }
            }
        }
    }
}
