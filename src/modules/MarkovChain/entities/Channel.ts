import { Entity, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm'

@Entity('channels')
export class Channel {
    @PrimaryColumn()
    id!: string

    @ManyToOne('Guild', 'channels')
    guild!: any

    @OneToMany('Message', 'channel')
    messages!: any[]
}