import { Column, Entity, JoinTable, ManyToMany, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm'
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
    @JoinColumn({ name: 'channel_id' })
    channel!: Channel

    @ManyToOne(() => Guild, guild => guild.channels)
    @Column({ name: 'guild_id' })
    guildId!: string

    @ManyToMany(() => Tag)
    @JoinTable()
    tags!: Tag[]
}
