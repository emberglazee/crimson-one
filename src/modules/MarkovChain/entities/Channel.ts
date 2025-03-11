import { Entity, ManyToOne, OneToMany, PrimaryColumn, Column } from 'typeorm'
import { type Guild } from './Guild'
import { type Message } from './Message'

@Entity('channels')
export class Channel {
    @PrimaryColumn()
    id!: string

    @ManyToOne('Guild', 'channel')
    guild!: Guild

    @OneToMany('Message', 'channel')
    messages!: Message[]

    @Column('boolean', { default: false })
    fullyCollected!: boolean
}
