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

export class BigramChainBuilder {
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
        const result: string[] = []

        if (seed && seed.length > 0 && this.chain.has(seed[seed.length - 1])) {
            current = seed[seed.length - 1]
            result.push(...seed)
        } else {
            current = Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
            result.push(current)
        }

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

export class TrigramChainBuilder {
    private chain: Map<string, MarkovNode> = new Map()
    private starters: string[] = []

    public train(text: string) {
        const words = text.split(/\s+/).filter(w => w.length > 0)
        if (words.length < 3) return

        this.starters.push(`${words[0]} ${words[1]}`)

        for (let i = 0; i < words.length - 2; i++) {
            const key = `${words[i]} ${words[i + 1]}`
            const nextWord = words[i + 2]

            if (!this.chain.has(key)) {
                this.chain.set(key, {
                    word: key,
                    next: new Map(),
                    total: 0
                })
            }

            const node = this.chain.get(key)!
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

        let currentKey: string | undefined
        const result: string[] = []

        if (seed && seed.length > 0) {
            if (seed.length >= 2) {
                const seedKey = `${seed[seed.length - 2]} ${seed[seed.length - 1]}`
                if (this.chain.has(seedKey)) {
                    currentKey = seedKey
                    result.push(...seed)
                }
            } else { // seed.length === 1
                const seedWord = seed[0]
                const possibleKeys = Array.from(this.chain.keys()).filter(key => key.startsWith(`${seedWord} `))
                if (possibleKeys.length > 0) {
                    // Pick a random key that starts with the seed word
                    currentKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)]
                    // Start the result with the words from the chosen key
                    result.push(...currentKey.split(' '))
                }
            }
        }

        // If no valid key from seed, or no seed, we need a starting point.
        if (!currentKey) {
            const randomStarterKey = this.starters[Math.floor(Math.random() * this.starters.length)]
            // Discard any previous result from a failed seed lookup and start fresh.
            result.length = 0
            result.push(...randomStarterKey.split(' '))
            currentKey = randomStarterKey
        }

        const targetLength = Math.floor(Math.random() * (maxWords - minWords + 1)) + minWords

        while (result.length < targetLength) {
            const node = this.chain.get(currentKey!)
            if (!node?.next.size) break

            const total = node.total
            let cumulative = 0
            const thresholds: [string, number][] = []

            for (const [word, freq] of node.next) {
                cumulative += freq / total
                thresholds.push([word, cumulative])
            }

            const rand = Math.random()
            let nextWord = thresholds[thresholds.length - 1][0]
            for (const [word, threshold] of thresholds) {
                if (rand <= threshold) {
                    nextWord = word
                    break
                }
            }

            result.push(nextWord)
            const lastTwoWords = result.slice(-2)
            currentKey = `${lastTwoWords[0]} ${lastTwoWords[1]}`
        }

        return result.join(' ')
    }

    public clear() {
        this.chain.clear()
    }
}
