import { Entity, OneToMany, PrimaryColumn } from 'typeorm'

@Entity('guilds')
export class Guild {
    @PrimaryColumn()
    id!: string

    @OneToMany('Channel', 'guild')
    channels!: any[]

    @OneToMany('Message', 'guild')
    messages!: any[]
}