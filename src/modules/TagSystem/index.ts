import { TagDataSource } from './DataSource'
import { Tag } from './entities/Tag'

export class TagManager {
    private static instance: TagManager
    private dataSource = TagDataSource.getInstance()

    private constructor() { }

    public static getInstance(): TagManager {
        if (!TagManager.instance) {
            TagManager.instance = new TagManager()
        }
        return TagManager.instance
    }

    public async init() {
        await this.dataSource.init()
    }

    private get repository() {
        if (!this.dataSource.orm) {
            throw new Error('DataSource is not initialized. Call TagManager.init() first.')
        }
        return this.dataSource.orm.getRepository(Tag)
    }

    public async getTag(guildId: string, name: string): Promise<Tag | null> {
        return this.repository.findOne({ where: { guildId, name } })
    }

    public async createTag(guildId: string, name: string, content: string, ownerId: string): Promise<Tag> {
        const existingTag = await this.getTag(guildId, name)
        if (existingTag) {
            throw new Error('A tag with this name already exists in this server.')
        }

        const newTag = this.repository.create({ guildId, name, content, ownerId })
        return this.repository.save(newTag)
    }

    public async deleteTag(guildId: string, name: string): Promise<void> {
        await this.repository.delete({ guildId, name })
    }

    public async listTags(guildId: string): Promise<Tag[]> {
        return this.repository.find({ where: { guildId } })
    }
}
