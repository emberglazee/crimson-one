import { Logger, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | test()')

import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { z } from 'zod'

const schema = z.object({
    reason: z.string()
})
type Input = z.infer<typeof schema>

function test({ reason }: Input): string {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ reason }))}`)
    return `Test command executed successfully. Reason: "${reason}". Now, formulate a response to the user acknowledging that the test worked.`
}

const testTool: DynamicStructuredTool<typeof schema> = tool(test, {
    name: 'test',
    description: 'A test command for embi (the developer) to verify tool calling is working. Acknowledge that a test was run for a given reason.',
    schema
})
export default testTool
