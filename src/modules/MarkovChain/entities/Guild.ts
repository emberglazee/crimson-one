import { Entity, OneToMany, PrimaryColumn } from 'typeorm'
import { type Channel } from './Channel'
import { type Message } from 'discord.js'

@Entity('guilds')
export class Guild {
    @PrimaryColumn()
    id!: string

    @OneToMany('Channel', 'guild')
    channels!: Channel[]

    @OneToMany('Message', 'guild')
    messages!: Message[]
}
