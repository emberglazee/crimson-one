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
        args: [FFIType.ptr, FFIType.ptr, FFIType.u32]
    },
    generate_text: {
        args: [FFIType.ptr, FFIType.i32, FFIType.u8, FFIType.cstring],
        returns: FFIType.ptr
    },
    free_text: {
        args: [FFIType.ptr]
    }
})

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

    public generate(maxWords: number = 30, mode: 'bigram' | 'trigram' = 'trigram', seed?: string): string {
        if (!this.chainPtr) {
            throw new Error('Cannot generate from a destroyed chain.')
        }
        const modeId = mode === 'bigram' ? 0 : 1
        const seedBuffer = seed ? Buffer.from(seed + '\0', 'utf8') : null
        const resultPtr: Pointer | null = symbols.generate_text(this.chainPtr, maxWords, modeId, seedBuffer)

        if (!resultPtr) {
            return ''
        }

        const result = new CString(resultPtr).toString()
        symbols.free_text(resultPtr)
        return result
    }

    public destroy(): void {
        if (this.chainPtr) {
            symbols.destroy_chain(this.chainPtr)
            this.chainPtr = null
        }
    }
}
