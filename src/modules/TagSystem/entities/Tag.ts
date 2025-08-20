import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

@Entity('tags')
@Index(['guildId', 'name'], { unique: true })
export class Tag {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    guildId!: string

    @Column()
    name!: string

    @Column('text')
    content!: string

    @Column()
    ownerId!: string

    @CreateDateColumn()
    createdAt!: Date
}
