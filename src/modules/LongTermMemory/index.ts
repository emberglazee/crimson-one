import { singleton } from 'tsyringe'
import { Logger } from '../Logger'
const logger = new Logger('LongTermMemoryManager')

import { LongTermMemoryDataSource } from './DataSource'
import { Memory } from './entities/Memory'

@singleton()
export class LongTermMemoryManager {
    public constructor(
        private dataSource: LongTermMemoryDataSource,
    ) { }

    public async init() {
        await this.dataSource.init()
    }

    private get repository() {
        if (!this.dataSource.orm) {
            throw new Error('DataSource is not initialized. Call LongTermMemoryManager.init() first.')
        }
        return this.dataSource.orm.getRepository(Memory)
    }

    public async addMemory(text: string, importance: number): Promise<Memory> {
        const newMemory = this.repository.create({ text, importance })
        logger.info(`Storing new memory (importance: ${importance}): "${text}"`)
        return this.repository.save(newMemory)
    }

    public async getAllMemories(): Promise<Memory[]> {
        return this.repository.find({ order: { createdAt: 'ASC' } })
    }

    public async clearMemories(): Promise<void> {
        await this.repository.clear()
    }
}
