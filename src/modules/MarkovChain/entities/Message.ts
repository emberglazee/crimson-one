import { Column, Entity, JoinTable, ManyToMany, ManyToOne, PrimaryColumn } from 'typeorm'
import { Tag } from './Tag'
import { type User } from './User'
import { type Channel } from './Channel'
import { type Guild } from './Guild'

@Entity('messages')
export class Message {
    @PrimaryColumn()
    id!: string

    @Column('text')
    text!: string

    @ManyToOne('User', 'messages')
    author!: User

    @ManyToOne('Channel', 'messages')
    channel!: Channel

    @ManyToOne('Guild', 'messages')
    guild!: Guild

    @ManyToMany(() => Tag)
    @JoinTable()
    tags!: Tag[]
}
