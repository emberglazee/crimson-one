import { dlopen, FFIType, suffix, CString, type Pointer } from 'bun:ffi'
import path from 'path'

const libPath = path.join(__dirname, `../../../crimson_markov/target/release/libcrimson_markov.${suffix}`)

// Define the FFI function signatures
const { symbols } = dlopen(libPath, {
    create_chain: {
        returns: FFIType.ptr
    },
    destroy_chain: {
        args: [FFIType.ptr]
    },
    train_on_batch: {
        args: [FFIType.ptr, FFIType.cstring] // chain_ptr, json_ptr
    },
    generate_text: {
        args: [FFIType.ptr, FFIType.i32, FFIType.u8, FFIType.cstring, FFIType.f64, FFIType.f64, FFIType.i32], // chain_ptr, max_words, mode, seed_ptr, db_query_ms, training_ms, batch_size
        returns: FFIType.ptr
    },
    generate_chat_response: {
        args: [FFIType.ptr, FFIType.i32, FFIType.cstring, FFIType.f64, FFIType.f64], // chain_ptr, max_words, seed_ptr, db_query_ms, training_ms
        returns: FFIType.ptr
    },
    free_text: {
        args: [FFIType.ptr]
    }
})

export interface Timings {
    db_query_ms: number
    training_ms: number
    generation_ms: number
}

export interface GenerationResult {
    text: string
    timings: Timings
}

export interface SimplifiedMessage {
    text: string
    timestamp: number
}

export class RustMarkovChain {
    private chainPtr: Pointer | null

    constructor() {
        this.chainPtr = symbols.create_chain()
        if (!this.chainPtr) {
            throw new Error('Creating the chain failed, chain pointer is null.')
        }
    }

    public trainBatch(messages: SimplifiedMessage[]): void {
        if (!this.chainPtr) {
            throw new Error('Chain pointer is null.')
        }
        const jsonString = JSON.stringify(messages)
        const jsonBuffer = Buffer.from(jsonString + '\0', 'utf8')
        symbols.train_on_batch(this.chainPtr, jsonBuffer)
    }

    public generate(
        maxWords: number = 30,
        mode: 'bigram' | 'trigram' | 'hybrid' = 'trigram',
        seed: string | undefined,
        dbQueryMs: number,
        trainingMs: number,
        batchSize: number = 1
    ): GenerationResult | GenerationResult[] | null {
        if (!this.chainPtr) {
            throw new Error('Cannot generate from a destroyed chain.')
        }
        const modeId = mode === 'bigram' ? 0 : (mode === 'hybrid' ? 2 : 1)
        const seedBuffer = seed ? Buffer.from(seed + '\0', 'utf8') : null

        const resultPtr: Pointer | null = symbols.generate_text(
            this.chainPtr,
            maxWords,
            modeId,
            seedBuffer,
            dbQueryMs,
            trainingMs,
            batchSize
        )

        if (!resultPtr) {
            return null
        }

        const jsonResult = new CString(resultPtr).toString()
        symbols.free_text(resultPtr)

        try {
            const parsed = JSON.parse(jsonResult)
            if (batchSize > 1) {
                return parsed as GenerationResult[]
            }
            return parsed as GenerationResult
        } catch (e) {
            console.error('Failed to parse JSON from Rust:', e)
            return null
        }
    }

    public generateChatResponse(
        maxWords: number = 30,
        seed: string,
        dbQueryMs: number,
        trainingMs: number
    ): GenerationResult | null {
        if (!this.chainPtr) {
            throw new Error('Cannot generate from a destroyed chain.')
        }
        const seedBuffer = Buffer.from(seed + '\0', 'utf8')
        const resultPtr: Pointer | null = symbols.generate_chat_response(
            this.chainPtr,
            maxWords,
            seedBuffer,
            dbQueryMs,
            trainingMs
        )

        if (!resultPtr) {
            return null
        }

        const jsonResult = new CString(resultPtr).toString()
        symbols.free_text(resultPtr)

        try {
            return JSON.parse(jsonResult) as GenerationResult
        } catch (e) {
            console.error('Failed to parse JSON from Rust:', e)
            return null
        }
    }

    public destroy(): void {
        if (this.chainPtr) {
            symbols.destroy_chain(this.chainPtr)
            this.chainPtr = null
        }
    }
}
