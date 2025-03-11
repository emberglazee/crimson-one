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
    @Column({ name: 'channel_id' })
    channelId!: string

    @ManyToOne(() => Guild, guild => guild.channels)
    @Column({ name: 'guild_id' })
    guildId!: string

    @ManyToMany(() => Tag)
    @JoinTable()
    tags!: Tag[]
}
