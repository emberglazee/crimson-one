import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm'

export type PlatformType = 'discord' | 'stoat'

@Entity('tags')
@Index(['platform', 'serverId', 'name'], { unique: true })
export class Tag {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({
        type: 'text',
        default: 'discord',
    })
    platform!: PlatformType

    @Column()
    serverId!: string

    @Column()
    name!: string

    @Column('text')
    content!: string

    @Column()
    ownerId!: string

    @CreateDateColumn()
    createdAt!: Date
}
