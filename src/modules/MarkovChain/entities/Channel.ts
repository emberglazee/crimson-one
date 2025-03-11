import { Entity, ManyToOne, OneToMany, PrimaryColumn, Column } from 'typeorm'
import { Guild } from './Guild'
import { Message } from './Message'

@Entity('channels')
export class Channel {
    @PrimaryColumn()
    id!: string

    @ManyToOne(() => Guild, guild => guild.channels)
    guild!: Guild

    @OneToMany(() => Message, message => message.channel)
    messages!: Message[]

    @Column('boolean', { default: false })
    fullyCollected!: boolean
}
