import { container } from 'tsyringe'
import { ToolRegistry } from './ToolRegistry'

let toolRegistry: ToolRegistry | null = null

export function getTools(): ReadonlyMap<string, import('./types').CrimsonTool> {
    if (!toolRegistry) {
        toolRegistry = container.resolve(ToolRegistry)
    }
    return toolRegistry.tools
}
