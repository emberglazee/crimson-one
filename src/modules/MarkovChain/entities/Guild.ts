import { Entity, OneToMany, PrimaryColumn, Column, Index } from 'typeorm'
import { Channel, type Channel as ChannelType } from './Channel'
import { Message, type Message as MessageType } from './Message'

export type GuildPlatform = 'discord' | 'stoat'

@Entity('guilds')
@Index(['platform', 'id'], { unique: true })
export class Guild {
    @PrimaryColumn()
    id!: string

    @Column({
        type: 'text',
        default: 'discord'
    })
    platform!: GuildPlatform

    @OneToMany(() => Channel, channel => channel.guild)
    channels!: ChannelType[]

    @OneToMany(() => Message, message => message.channel)
    messages!: MessageType[]
}
