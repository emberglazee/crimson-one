import { Entity, OneToMany, PrimaryColumn } from 'typeorm'
import { Channel, type Channel as ChannelType } from './Channel'
import { Message, type Message as MessageType } from './Message'

@Entity('guilds')
export class Guild {
    @PrimaryColumn()
    id!: string

    @OneToMany(() => Channel, channel => channel.guild)
    channels!: ChannelType[]

    @OneToMany(() => Message, message => message.channel)
    messages!: MessageType[]
}
