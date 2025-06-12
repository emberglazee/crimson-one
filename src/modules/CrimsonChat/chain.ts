import { ChatGoogleGenerativeAI } from '@langchain/google-genai'

import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import { GEMINI_MODEL } from '../../util/constants'
import type { BaseMessage } from '@langchain/core/messages'
import { addTools } from './tools'

export interface CrimsonChainInput {
    input: BaseMessage['content']
    chat_history?: BaseMessage[]
}

export const createCrimsonChain = async () => {
    const prompt = ChatPromptTemplate.fromMessages([
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
    ])

    const model = new ChatGoogleGenerativeAI({
        model: GEMINI_MODEL,
        temperature: 0.8,
        apiKey: process.env.GEMINI_API_KEY
    })

    const modelWithTools = await addTools(model)

    const chain = RunnableSequence.from([prompt, modelWithTools])
    return chain
}
