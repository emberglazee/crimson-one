import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne, PrimaryColumn } from 'typeorm'

import { Tag } from './Tag'
import { User, type User as UserType } from './User'
import { Channel, type Channel as ChannelType } from './Channel'
import { Guild, type Guild as GuildType } from './Guild'

@Entity('messages')
export class Message {
    @PrimaryColumn()
    id!: string

    @Column('text')
    text!: string

    @Column()
    authorId!: string

    @Column()
    channelId!: string

    @Column()
    guildId!: string

    @ManyToOne(() => User, user => user.messages)
    author!: UserType

    @ManyToOne(() => Channel, channel => channel.messages)
    @Index()
    channel!: ChannelType

    @ManyToOne(() => Guild, guild => guild.messages)
    @Index()
    guild!: GuildType

    @ManyToMany(() => Tag)
    @JoinTable()
    tags!: Tag[]

    @Column('int')
    timestamp!: number
}
