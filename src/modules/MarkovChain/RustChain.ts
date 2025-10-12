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
        args: [FFIType.ptr, FFIType.ptr, FFIType.u32] // chain_ptr, texts_ptr, texts_len
    },
    generate_text: {
        args: [FFIType.ptr, FFIType.i32, FFIType.u8, FFIType.cstring, FFIType.f64, FFIType.f64, FFIType.i32], // chain_ptr, max_words, mode, seed_ptr, db_query_ms, training_ms, batch_size
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

export class RustMarkovChain {
    private chainPtr: Pointer | null

    constructor() {
        this.chainPtr = symbols.create_chain()
        if (!this.chainPtr) {
            throw new Error('Creating the chain failed, chain pointer is null.')
        }
    }

    public trainBatch(texts: string[]): void {
        if (!this.chainPtr) {
            throw new Error('Chain pointer is null.')
        }

        const batchString = texts.join('\0')
        const textBuffer = Buffer.from(batchString, 'utf8') // No trailing null needed now
        symbols.train_on_batch(this.chainPtr, textBuffer, textBuffer.byteLength)
    }

    public generate(
        maxWords: number = 30,
        mode: 'bigram' | 'trigram' = 'trigram',
        seed: string | undefined,
        dbQueryMs: number,
        trainingMs: number,
        batchSize: number = 1
    ): GenerationResult | GenerationResult[] | null {
        if (!this.chainPtr) {
            throw new Error('Cannot generate from a destroyed chain.')
        }
        const modeId = mode === 'bigram' ? 0 : 1
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

    public destroy(): void {
        if (this.chainPtr) {
            symbols.destroy_chain(this.chainPtr)
            this.chainPtr = null
        }
    }
}
