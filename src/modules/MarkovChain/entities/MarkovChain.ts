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

// --- Helper Functions ---

/**
 * A more advanced tokenizer that separates words, punctuation, and URLs.
 * @param text The input string.
 * @returns An array of tokens.
 */
function tokenize(text: string): string[] {
    // Regex to match URLs, words (with contractions), and individual punctuation
    const tokenRegex = /(https?:\/\/[^\s]+)|(\w+('\w+)*)|([.,!?;:"'()[\]{}])/g
    return text.match(tokenRegex) || []
}

/**
 * Chooses the most frequent casing for a word.
 * @param casingMap A map of original casings and their frequencies.
 * @returns The most common casing.
 */
function getPreferredCasing(casingMap: Map<string, number>): string {
    let preferredCasing = ''
    let maxCount = 0
    for (const [casing, count] of casingMap.entries()) {
        if (count > maxCount) {
            maxCount = count
            preferredCasing = casing
        }
    }
    return preferredCasing
}

/**
 * Joins tokens back into a readable string, handling spacing around punctuation.
 * @param tokens The array of tokens to join.
 * @returns A formatted string.
 */
function joinTokens(tokens: string[]): string {
    let result = ''
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const nextToken = tokens[i + 1]

        result += token

        // Add a space if the next token is not punctuation (or if it's a bracket)
        if (nextToken && !/^[.,!?;:"'()[\]{}]/.test(nextToken)) {
            result += ' '
        }
    }
    return result.trim()
}


// --- Chain Builders ---

export class BigramChainBuilder {
    private chain: Map<string, MarkovNode> = new Map()
    private casingMap: Map<string, Map<string, number>> = new Map()

    public train(text: string) {
        const words = tokenize(text)
        if (words.length < 2) return

        for (let i = 0; i < words.length - 1; i++) {
            const currentWord = words[i]
            const nextWord = words[i + 1]

            // --- Casing Map Population ---
            const lowerCurrent = currentWord.toLowerCase()
            if (!this.casingMap.has(lowerCurrent)) {
                this.casingMap.set(lowerCurrent, new Map())
            }
            const currentCaseMap = this.casingMap.get(lowerCurrent)!
            currentCaseMap.set(currentWord, (currentCaseMap.get(currentWord) || 0) + 1)

            // --- Chain Training (using lowercase) ---
            const lowerNext = nextWord.toLowerCase()
            if (!this.chain.has(lowerCurrent)) {
                this.chain.set(lowerCurrent, {
                    word: lowerCurrent,
                    next: new Map(),
                    total: 0
                })
            }

            const node = this.chain.get(lowerCurrent)!
            node.next.set(lowerNext, (node.next.get(lowerNext) || 0) + 1)
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

        const lowerSeed = seed?.map(s => s.toLowerCase())

        if (lowerSeed && lowerSeed.length > 0 && this.chain.has(lowerSeed[lowerSeed.length - 1])) {
            current = lowerSeed[lowerSeed.length - 1]
            result.push(...lowerSeed)
        } else {
            current = Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
            result.push(current)
        }

        const targetLength = Math.floor(Math.random() * (maxWords - minWords + 1)) + minWords

        while (result.length < targetLength) {
            const node = this.chain.get(current)
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
            current = nextWord
        }

        // --- Reconstruct casing and join ---
        const finalResult = result.map(word => {
            const casingOptions = this.casingMap.get(word)
            return casingOptions ? getPreferredCasing(casingOptions) : word
        })

        return joinTokens(finalResult)
    }

    public clear() {
        this.chain.clear()
        this.casingMap.clear()
    }
}

export class TrigramChainBuilder {
    private chain: Map<string, MarkovNode> = new Map()
    private starters: string[] = []
    private casingMap: Map<string, Map<string, number>> = new Map()

    public train(text: string) {
        const words = tokenize(text)
        if (words.length < 3) return

        // --- Casing Map Population ---
        words.forEach(word => {
            const lower = word.toLowerCase()
            if (!this.casingMap.has(lower)) {
                this.casingMap.set(lower, new Map())
            }
            const caseMap = this.casingMap.get(lower)!
            caseMap.set(word, (caseMap.get(word) || 0) + 1)
        })

        // --- Chain Training (using lowercase) ---
        const lowerWords = words.map(w => w.toLowerCase())

        this.starters.push(`${lowerWords[0]} ${lowerWords[1]}`)

        for (let i = 0; i < lowerWords.length - 2; i++) {
            const key = `${lowerWords[i]} ${lowerWords[i + 1]}`
            const nextWord = lowerWords[i + 2]

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
        const lowerSeed = seed?.map(s => s.toLowerCase())

        if (lowerSeed && lowerSeed.length > 0) {
            if (lowerSeed.length >= 2) {
                const seedKey = `${lowerSeed[lowerSeed.length - 2]} ${lowerSeed[lowerSeed.length - 1]}`
                if (this.chain.has(seedKey)) {
                    currentKey = seedKey
                    result.push(...lowerSeed)
                }
            } else { // seed.length === 1
                const seedWord = lowerSeed[0]
                const possibleKeys = Array.from(this.chain.keys()).filter(key => key.startsWith(`${seedWord} `))
                if (possibleKeys.length > 0) {
                    currentKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)]
                    result.push(...currentKey.split(' '))
                }
            }
        }

        if (!currentKey) {
            const randomStarterKey = this.starters[Math.floor(Math.random() * this.starters.length)]
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

        // --- Reconstruct casing and join ---
        const finalResult = result.map(word => {
            const casingOptions = this.casingMap.get(word)
            return casingOptions ? getPreferredCasing(casingOptions) : word
        })

        return joinTokens(finalResult)
    }

    public clear() {
        this.chain.clear()
        this.starters = []
        this.casingMap.clear()
    }
}