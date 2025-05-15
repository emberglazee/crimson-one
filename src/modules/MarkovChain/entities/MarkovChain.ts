export interface MarkovNode {
    word: string
    next: Map<string, number>
    total: number
}

export interface MarkovChainOptions {
    minWords?: number
    maxWords?: number
    seed?: string[]
}

export class ChainBuilder {
    private chain: Map<string, MarkovNode> = new Map()

    public train(text: string) {
        const words = text.split(/\s+/).filter(w => w.length > 0)
        if (words.length < 2) return

        for (let i = 0; i < words.length - 1; i++) {
            const word = words[i]
            const nextWord = words[i + 1]

            if (!this.chain.has(word)) {
                this.chain.set(word, {
                    word,
                    next: new Map(),
                    total: 0
                })
            }

            const node = this.chain.get(word)!
            node.next.set(nextWord, (node.next.get(nextWord) || 0) + 1)
            node.total++
        }
    }

    public generate(options: MarkovChainOptions = {}): string {
        const {
            minWords = 5,
            maxWords = 50,
            seed
        } = options

        if (this.chain.size === 0) {
            throw new Error('No data to generate from')
        }

        let current: string
        if (seed && seed.length > 0) {
            // Try to start with the last word of the seed if it exists in the chain
            const lastSeedWord = seed[seed.length - 1]
            current = this.chain.has(lastSeedWord)
                ? lastSeedWord
                : Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
        } else {
            current = Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
        }

        const result: string[] = seed || []
        const targetLength = Math.floor(Math.random() * (maxWords - minWords + 1)) + minWords

        while (result.length < targetLength) {
            const node = this.chain.get(current)
            if (!node?.next.size) break

            // Convert frequencies to cumulative probabilities
            const total = node.total
            let cumulative = 0
            const thresholds: [string, number][] = []

            for (const [word, freq] of node.next) {
                cumulative += freq / total
                thresholds.push([word, cumulative])
            }

            // Select next word based on probabilities
            const rand = Math.random()
            let nextWord = thresholds[thresholds.length - 1][0]
            for (const [word, threshold] of thresholds) {
                if (rand <= threshold) {
                    nextWord = word
                    break
                }
            }

            result.push(nextWord)
            current = nextWord
        }

        return result.join(' ')
    }

    public clear() {
        this.chain.clear()
    }
}

// Character-by-character Markov chain builder
export interface CharacterMarkovNode {
    char: string
    next: Map<string, number>
    total: number
}

export interface CharacterMarkovChainOptions {
    minChars?: number
    maxChars?: number
    seed?: string
}

export class CharacterChainBuilder {
    private chain: Map<string, CharacterMarkovNode> = new Map()

    public train(text: string) {
        const chars = Array.from(text)
        if (chars.length < 2) return

        for (let i = 0; i < chars.length - 1; i++) {
            const char = chars[i]
            const nextChar = chars[i + 1]

            if (!this.chain.has(char)) {
                this.chain.set(char, {
                    char,
                    next: new Map(),
                    total: 0
                })
            }

            const node = this.chain.get(char)!
            node.next.set(nextChar, (node.next.get(nextChar) || 0) + 1)
            node.total++
        }
    }

    public generate(options: CharacterMarkovChainOptions = {}): string {
        const {
            minChars = 10,
            maxChars = 100,
            seed
        } = options

        if (this.chain.size === 0) {
            throw new Error('No data to generate from')
        }

        let current: string
        let result: string[] = []
        if (seed && seed.length > 0) {
            // Try to start with the last char of the seed if it exists in the chain
            const lastSeedChar = seed[seed.length - 1]
            current = this.chain.has(lastSeedChar)
                ? lastSeedChar
                : Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
            result = Array.from(seed)
        } else {
            current = Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
            result = [current]
        }

        const targetLength = Math.floor(Math.random() * (maxChars - minChars + 1)) + minChars

        while (result.length < targetLength) {
            const node = this.chain.get(current)
            if (!node?.next.size) break

            // Convert frequencies to cumulative probabilities
            const total = node.total
            let cumulative = 0
            const thresholds: [string, number][] = []

            for (const [char, freq] of node.next) {
                cumulative += freq / total
                thresholds.push([char, cumulative])
            }

            // Select next char based on probabilities
            const rand = Math.random()
            let nextChar = thresholds[thresholds.length - 1][0]
            for (const [char, threshold] of thresholds) {
                if (rand <= threshold) {
                    nextChar = char
                    break
                }
            }

            result.push(nextChar)
            current = nextChar
        }

        return result.join('')
    }

    public clear() {
        this.chain.clear()
    }
}
