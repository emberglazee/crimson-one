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
