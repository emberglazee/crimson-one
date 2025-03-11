import { Entity, ManyToOne, OneToMany, PrimaryColumn, Column, JoinColumn } from 'typeorm'
import { Guild } from './Guild'
import { Message } from './Message'

@Entity('channels')
export class Channel {
    @PrimaryColumn()
    id!: string

    @Column({ name: 'guild_id' })
    guildId!: string

    @Column()
    name!: string

    @Column({ default: false })
    fullyCollected!: boolean

    @ManyToOne(() => Guild, guild => guild.channels)
    @JoinColumn({ name: 'guild_id' })
    guild!: Guild

    @OneToMany(() => Message, message => message.channelId)
    messages!: Message[]
}
