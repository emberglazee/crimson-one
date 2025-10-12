import { Column, Entity, Index, ManyToOne, PrimaryColumn } from 'typeorm'

import { User, type User as UserType } from './User'
import { Channel, type Channel as ChannelType } from './Channel'
import { Guild, type Guild as GuildType } from './Guild'

@Entity('messages')
@Index(['guildId', 'channelId', 'authorId'])
@Index(['guildId', 'authorId'])
export class Message {
    @PrimaryColumn()
    id!: string

    @Column('text')
    text!: string

    @Column()
    @Index()
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

    @Column('bigint')
    timestamp!: number
}
