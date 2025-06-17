import { Logger, red, yellow } from '../../util/logger'
const logger = new Logger('CrimsonChat | ToolManager')

import { readdir } from 'fs/promises'
import path from 'path'
import type { FunctionDeclaration, Tool as GeminiTool, FunctionDeclarationSchema, FunctionDeclarationSchemaProperty } from '@google/generative-ai'
import { SchemaType } from '@google/generative-ai'
import { ZodType, z, ZodObject, ZodOptional, ZodFirstPartyTypeKind, type ZodTypeDef } from 'zod'

// Interface for our custom tool definition
export interface CrimsonTool<T extends z.AnyZodObject = z.AnyZodObject> {
    name: string
    description: string
    schema: T
    invoke: (args: z.infer<T>) => Promise<string>
}

// Map to hold our tools for easy lookup
export const toolMap = new Map<string, CrimsonTool>()
// Array to hold the Google-formatted tools
let googleTools: GeminiTool[] = []

// Utility to convert Zod schema to JSON schema for Gemini
function zodToJsonSchema(schema: ZodType<unknown, ZodTypeDef, unknown>): FunctionDeclarationSchema {
    if (!(schema instanceof ZodObject)) {
        // If not a ZodObject, return a valid empty object schema
        return {
            type: SchemaType.OBJECT,
            properties: {},
            required: [],
        }
    }

    const shape = schema.shape as Record<string, ZodType>
    const properties: Record<string, FunctionDeclarationSchemaProperty> = {}
    const required: string[] = []

    for (const key in shape) {
        const field = shape[key]
        const isOptional = field instanceof ZodOptional
        // Correctly get the underlying type definition
        const actualType = isOptional ? (field as ZodOptional<ZodType>)._def.innerType : field

        let property: FunctionDeclarationSchemaProperty // Declare property here

        switch ((actualType._def as { typeName: ZodFirstPartyTypeKind }).typeName) {
            case ZodFirstPartyTypeKind.ZodString:
                property = { type: SchemaType.STRING }
                break
            case ZodFirstPartyTypeKind.ZodNumber:
                property = { type: SchemaType.NUMBER }
                break
            case ZodFirstPartyTypeKind.ZodBoolean:
                property = { type: SchemaType.BOOLEAN }
                break
            case ZodFirstPartyTypeKind.ZodArray:
                property = {
                    type: SchemaType.ARRAY,
                    // For simplicity, assuming array items are strings.
                    // A more robust solution would recursively determine the item type.
                    items: { type: SchemaType.STRING }
                }
                break
            case ZodFirstPartyTypeKind.ZodObject:
                property = {
                    type: SchemaType.OBJECT,
                    // Recursively call zodToJsonSchema for nested objects
                    properties: zodToJsonSchema(actualType as z.AnyZodObject).properties
                }
                break
            default:
                property = { type: SchemaType.STRING } // fallback
        }

        if (field.description) {
            property.description = field.description
        }

        properties[key] = property

        if (!isOptional) {
            required.push(key)
        }
    }

    return {
        type: SchemaType.OBJECT,
        properties,
        required,
    }
}


export async function loadTools(): Promise<GeminiTool[]> {
    if (googleTools.length > 0) {
        return googleTools
    }

    const toolsDir = path.join(__dirname, 'tools')
    try {
        const files = await readdir(toolsDir)
        const functionDeclarations: FunctionDeclaration[] = []

        for (const file of files) {
            // We are running under Bun, don't bother with Javascript
            if (file.endsWith('.ts')) {
                try {
                    const toolModule = await import(path.join(toolsDir, file))
                    const toolDef = toolModule.default as CrimsonTool

                    if (toolDef && toolDef.name && toolDef.schema) {
                        toolMap.set(toolDef.name, toolDef)
                        functionDeclarations.push({
                            name: toolDef.name,
                            description: toolDef.description,
                            parameters: zodToJsonSchema(toolDef.schema),
                        })
                        logger.ok(`Loaded tool: ${yellow(toolDef.name)}`)
                    }
                } catch (error) {
                    logger.warn(`Failed to load tool from ${file}: ${red(error)}`)
                }
            }
        }

        if (functionDeclarations.length > 0) {
            googleTools = [{ functionDeclarations }]
        }

    } catch (error) {
        logger.warn(`Could not read tools directory at ${toolsDir}: ${red(error)}`)
    }

    return googleTools
}
