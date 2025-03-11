import { Entity, OneToMany, PrimaryColumn } from 'typeorm'
import { Channel } from './Channel'
import { Message } from 'discord.js'

@Entity('guilds')
export class Guild {
    @PrimaryColumn()
    id!: string

    @OneToMany(() => Channel, channel => channel.guild)
    channels!: Channel[]

    @OneToMany(() => Message, message => message.guild)
    messages!: Message[]
}
