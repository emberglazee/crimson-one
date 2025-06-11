// src/modules/CrimsonChat/chain.ts

import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'

import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { RunnableSequence } from '@langchain/core/runnables'
import { OPENAI_BASE_URL, OPENAI_MODEL, GEMINI_MODEL, GEMINI_SWITCH, CRIMSON_CHAT_SYSTEM_PROMPT } from '../../util/constants'
import type { BaseMessage } from '@langchain/core/messages'

export interface CrimsonChainInput {
    input: string
    // Make chat_history optional for the initial call to the wrapped chain.
    // The RunnableWithMessageHistory wrapper will inject this property.
    chat_history?: BaseMessage[]
}

export const createCrimsonChain = () => {
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', CRIMSON_CHAT_SYSTEM_PROMPT],
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
    ])

    const model = GEMINI_SWITCH ? new ChatGoogleGenerativeAI({
        model: GEMINI_MODEL,
        temperature: 0.8,
        apiKey: process.env.GEMINI_API_KEY
    }) : new ChatOpenAI({
        model: OPENAI_MODEL,
        temperature: 0.8,
        apiKey: process.env.OPENAI_API_KEY,
        configuration: {
            baseURL: OPENAI_BASE_URL
        },
    })

    const outputParser = new StringOutputParser()

    const chain = RunnableSequence.from([prompt, model, outputParser])
    return chain
}
