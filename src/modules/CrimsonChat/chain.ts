import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import type { BaseMessage } from '@langchain/core/messages'

import { GEMINI_MODEL } from '../../util/constants'
import { addTools } from './tools'

export interface CrimsonChainInput {
    input: BaseMessage[]
    chat_history?: BaseMessage[]
}

export const createCrimsonChain = async (berserkMode = false) => {
    const prompt = ChatPromptTemplate.fromMessages([
        new MessagesPlaceholder('chat_history'),
        new MessagesPlaceholder('input'),
    ])

    const modelParams = berserkMode
        ? { temperature: 2.0, topP: 1.0 }
        : { temperature: 0.8 }

    const model = new ChatGoogleGenerativeAI({
        model: GEMINI_MODEL,
        apiKey: process.env.GEMINI_API_KEY,
        baseUrl: process.env.GEMINI_BASE_URL,
        ...modelParams
    })

    const modelWithTools = await addTools(model)

    const chain = RunnableSequence.from([prompt, modelWithTools])
    return chain
}
