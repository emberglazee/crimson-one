import {
    Entity,
    ManyToOne,
    OneToMany,
    PrimaryColumn,
    Column,
    Index
} from 'typeorm'
import { Guild, type Guild as GuildType } from './Guild'
import { Message, type Message as MessageType } from './Message'

export type ChannelPlatform = 'discord' | 'stoat'

@Entity('channels')
@Index(['platform', 'id'], { unique: true })
export class Channel {
    @PrimaryColumn()
    id!: string

    @Column({
        type: 'text',
        default: 'discord'
    })
    platform!: ChannelPlatform

    @ManyToOne(() => Guild, guild => guild.channels)
    guild!: GuildType

    @OneToMany(() => Message, message => message.channel)
    messages!: MessageType[]

    @Column('boolean', { default: false })
    fullyCollected!: boolean
}
