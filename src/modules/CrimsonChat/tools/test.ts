// modules\CrimsonChat\tools\test.ts
import { Logger, yellow } from '../../../util/logger'
const logger = new Logger('CrimsonChat | test()')

import { z } from 'zod'
import type { CrimsonTool } from '../tools'

const schema = z.object({
    reason: z.string().describe("The reason for running this test."),
})
type Input = z.infer<typeof schema>

function invoke({ reason }: Input): Promise<string> {
    logger.debug(`Invoked with args: ${yellow(JSON.stringify({ reason }))}`)
    const result = `Test command executed successfully. Reason: "${reason}". Now, formulate a response to the user acknowledging that the test worked.`
    return Promise.resolve(result)
}

const testTool: CrimsonTool<typeof schema> = {
    name: 'test',
    description: 'A test command for embi (the developer) to verify tool calling is working. Acknowledge that a test was run for a given reason.',
    schema,
    invoke
}
export default testTool
