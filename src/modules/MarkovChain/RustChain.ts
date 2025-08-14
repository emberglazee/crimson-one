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
    train_on_text: {
        args: [FFIType.ptr, FFIType.cstring]
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
            throw new Error('Failed to create Rust Markov chain.')
        }
    }

    public train(text: string): void {
        if (!this.chainPtr) {
            throw new Error('Cannot train on a destroyed chain.')
        }
        // The string must be converted to a null-terminated buffer to be passed as a cstring
        const textBuffer = Buffer.from(text + '\0', 'utf8')
        symbols.train_on_text(this.chainPtr, textBuffer)
    }

    public generate(maxWords: number = 30, mode: 'bigram' | 'trigram' = 'trigram', seed?: string): string {
        if (!this.chainPtr) {
            throw new Error('Cannot generate from a destroyed chain.')
        }
        const modeId = mode === 'bigram' ? 0 : 1
        const seedBuffer = seed ? Buffer.from(seed + '\0', 'utf8') : null
        const resultPtr: Pointer | null = symbols.generate_text(this.chainPtr, maxWords, modeId, seedBuffer)

        if (!resultPtr) {
            return '' // Or throw an error if generation fails
        }

        const result = new CString(resultPtr).toString()
        symbols.free_text(resultPtr)
        return result
    }

    public destroy(): void {
        if (this.chainPtr) {
            symbols.destroy_chain(this.chainPtr)
            this.chainPtr = null // Invalidate the pointer
        }
    }
}
