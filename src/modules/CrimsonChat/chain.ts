// src/modules/CrimsonChat/chain.ts

import { ChatOpenAI } from '@langchain/openai'
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { RunnableSequence } from '@langchain/core/runnables'
import { OPENAI_BASE_URL, OPENAI_MODEL, CRIMSON_CHAT_SYSTEM_PROMPT } from '../../util/constants'
import type { BaseMessage } from '@langchain/core/messages'

export interface CrimsonChainInput {
    input: string
    // Make chat_history optional for the initial call to the wrapped chain.
    // The RunnableWithMessageHistory wrapper will inject this property.
    chat_history?: BaseMessage[] // Use BaseMessage[] for type safety
}

export const createCrimsonChain = () => {
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', CRIMSON_CHAT_SYSTEM_PROMPT],
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
    ])

    const model = new ChatOpenAI({
        modelName: OPENAI_MODEL,
        temperature: 0.8,
        openAIApiKey: process.env.OPENAI_API_KEY,
        configuration: {
            baseURL: OPENAI_BASE_URL,
        },
    })

    const outputParser = new StringOutputParser()

    // The core chain: prompt -> model -> output parser
    const chain = RunnableSequence.from([prompt, model, outputParser])

    return chain
}
