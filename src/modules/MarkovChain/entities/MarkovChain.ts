// Generic interfaces
export interface BaseMarkovNode<T> {
    item: T
    next: Map<T, number>
    total: number
}

export interface BaseChainOptions<S, _> {
    minItems?: number
    maxItems?: number
    seed?: S
}

// Abstract Base Chain Builder
abstract class BaseChainBuilder<
    TItem,
    TSeed,
    TNode extends BaseMarkovNode<TItem>,
    TOptions extends BaseChainOptions<TSeed, TItem>
> {
    protected chain: Map<TItem, TNode> = new Map()

    protected abstract splitInput(text: string): TItem[]
    protected abstract joinOutput(items: TItem[]): string
    protected abstract createNode(item: TItem): TNode
    protected abstract getSeedItems(options: TOptions): TItem[]
    protected abstract getDefaultMinItems(): number
    protected abstract getDefaultMaxItems(): number


    public train(text: string): void {
        const items = this.splitInput(text)
        if (items.length < 2) return

        for (let i = 0; i < items.length - 1; i++) {
            const item = items[i]
            const nextItem = items[i + 1]

            if (!this.chain.has(item)) {
                this.chain.set(item, this.createNode(item))
            }

            const node = this.chain.get(item)!
            node.next.set(nextItem, (node.next.get(nextItem) || 0) + 1)
            node.total++
        }
    }

    public generate(options: TOptions = {} as TOptions): string {
        const minItems = options.minItems ?? this.getDefaultMinItems()
        const maxItems = options.maxItems ?? this.getDefaultMaxItems()

        if (this.chain.size === 0) {
            throw new Error('No data to generate from')
        }

        let resultItems: TItem[] = this.getSeedItems(options) // Processed seed
        let current: TItem

        if (resultItems.length > 0) {
            const lastSeedItem = resultItems[resultItems.length - 1]
            if (this.chain.has(lastSeedItem)) {
                current = lastSeedItem
            } else {
                // Seed item not in chain, start random, discard invalid seed items for generation
                current = Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
                resultItems = [current]
            }
        } else {
            // No seed or empty seed from getSeedItems
            current = Array.from(this.chain.keys())[Math.floor(Math.random() * this.chain.size)]
            resultItems = [current]
        }

        const targetLength = Math.floor(Math.random() * (maxItems - minItems + 1)) + minItems

        // Ensure resultItems is not shorter than targetLength if seed is long,
        // or fill up to targetLength
        while (resultItems.length < targetLength) {
            const node = this.chain.get(current)
            if (!node?.next.size) break // No further path

            const total = node.total
            let cumulative = 0
            const thresholds: [TItem, number][] = []

            for (const [item, freq] of node.next) {
                cumulative += freq / total
                thresholds.push([item, cumulative])
            }

            const rand = Math.random()
            let nextItem = thresholds[thresholds.length - 1][0] // Default to last if something goes wrong
            for (const [item, threshold] of thresholds) {
                if (rand <= threshold) {
                    nextItem = item
                    break
                }
            }

            resultItems.push(nextItem)
            current = nextItem
        }

        // If the generated result is shorter than minItems (e.g. dead end),
        // and also shorter than the original seed if provided, it might be an issue.
        // However, the current logic correctly stops if a dead end is reached.
        // The targetLength is a target, not a guaranteed minimum if the chain cannot produce it.

        return this.joinOutput(resultItems)
    }

    public clear(): void {
        this.chain.clear()
    }
}

// Word-based Markov chain
export interface MarkovNode extends BaseMarkovNode<string> {
    word: string // Alias for item
}

export interface MarkovChainOptions extends BaseChainOptions<string[], string> {
    minWords?: number // Alias for minItems
    maxWords?: number // Alias for maxItems
}

export class ChainBuilder extends BaseChainBuilder<string, string[], MarkovNode, MarkovChainOptions> {
    protected splitInput(text: string): string[] {
        return text.split(/\s+/).filter(w => w.length > 0)
    }

    protected joinOutput(items: string[]): string {
        return items.join(' ')
    }

    protected createNode(item: string): MarkovNode {
        return {
            item: item,
            word: item, // Keep 'word' for compatibility if anything relies on it
            next: new Map(),
            total: 0
        }
    }

    protected getSeedItems(options: MarkovChainOptions): string[] {
        return options.seed || []
    }

    protected getDefaultMinItems(): number {
        return 5
    }

    protected getDefaultMaxItems(): number {
        return 50
    }

    // Make generate's options parameter match the specific MarkovChainOptions
    public generate(options: MarkovChainOptions = {}): string {
        // Map minWords/maxWords to minItems/maxItems for the base class
        const baseOptions: BaseChainOptions<string[], string> & { minItems?: number; maxItems?: number } = {
            ...options,
            minItems: options.minWords ?? options.minItems,
            maxItems: options.maxWords ?? options.maxItems,
        }
        return super.generate(baseOptions)
    }
}

// Character-based Markov chain
export interface CharacterMarkovNode extends BaseMarkovNode<string> {
    char: string // Alias for item
}

export interface CharacterMarkovChainOptions extends BaseChainOptions<string, string> {
    minChars?: number // Alias for minItems
    maxChars?: number // Alias for maxItems
}

export class CharacterChainBuilder extends BaseChainBuilder<string, string, CharacterMarkovNode, CharacterMarkovChainOptions> {
    protected splitInput(text: string): string[] {
        return Array.from(text)
    }

    protected joinOutput(items: string[]): string {
        return items.join('')
    }

    protected createNode(item: string): CharacterMarkovNode {
        return {
            item: item,
            char: item, // Keep 'char' for compatibility
            next: new Map(),
            total: 0
        }
    }

    protected getSeedItems(options: CharacterMarkovChainOptions): string[] {
        return options.seed ? Array.from(options.seed) : []
    }

    protected getDefaultMinItems(): number {
        return 10
    }

    protected getDefaultMaxItems(): number {
        return 100
    }

    // Make generate's options parameter match the specific CharacterMarkovChainOptions
    public generate(options: CharacterMarkovChainOptions = {}): string {
         // Map minChars/maxChars to minItems/maxItems for the base class
        const baseOptions: BaseChainOptions<string, string> & { minItems?: number; maxItems?: number } = {
            ...options,
            minItems: options.minChars ?? options.minItems,
            maxItems: options.maxChars ?? options.maxItems,
        }
        return super.generate(baseOptions)
    }
}
