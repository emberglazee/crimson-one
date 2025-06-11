import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const schema = z.object({
    reason: z.string()
})

export default tool(
    ({ reason }: z.infer<typeof schema>) => {
        return `Test command executed successfully. Reason: "${reason}". Now, formulate a response to the user acknowledging that the test worked.`
    },
    {
        name: 'test',
        description: 'A test command for developers to verify tool calling is working. Acknowledge that a test was run for a given reason.',
        schema
    }
)
