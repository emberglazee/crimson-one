import { Column, Entity, JoinTable, ManyToMany, ManyToOne, PrimaryColumn } from 'typeorm'
import { Tag } from './Tag'
import { User } from './User'
import { Channel } from './Channel'
import { Guild } from './Guild'

@Entity('messages')
export class Message {
    @PrimaryColumn()
    id!: string

    @Column('text')
    text!: string

    @ManyToOne(() => User, user => user.messages)
    author!: User

    @ManyToOne(() => Channel, channel => channel.messages)
    channel!: Channel

    @ManyToOne(() => Guild, guild => guild.messages)
    guild!: Guild

    @ManyToMany(() => Tag)
    @JoinTable()
    tags!: Tag[]
}
