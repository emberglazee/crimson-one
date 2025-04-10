import { Entity, ManyToOne, OneToMany, PrimaryColumn, Column } from 'typeorm'
import { Guild, type Guild as GuildType } from './Guild'
import { Message, type Message as MessageType } from './Message'

@Entity('channels')
export class Channel {
    @PrimaryColumn()
    id!: string

    @ManyToOne(() => Guild, guild => guild.channels)
    guild!: GuildType

    @OneToMany(() => Message, message => message.channel)
    messages!: MessageType[]

    @Column('boolean', { default: false })
    fullyCollected!: boolean
}
