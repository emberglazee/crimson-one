import { Column, Entity, JoinTable, ManyToMany, ManyToOne, PrimaryColumn } from 'typeorm'
import { Tag } from './Tag'

@Entity('messages')
export class Message {
    @PrimaryColumn()
    id!: string

    @Column('text')
    text!: string

    @ManyToOne('User', 'messages')
    author!: any

    @ManyToOne('Channel', 'messages')
    channel!: any

    @ManyToOne('Guild', 'messages')
    guild!: any

    @ManyToMany(() => Tag)
    @JoinTable()
    tags!: Tag[]
}