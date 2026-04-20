export interface CrimsonTool {
    name: string
    description: string
    parameters: Array<{
        name: string
        type: 'string' | 'number' | 'boolean'
        description: string
        required: boolean
    }>
    execute: (args: Record<string, string | number | boolean>, deps: { client: import('discord.js').Client }) => Promise<string | void>
}
