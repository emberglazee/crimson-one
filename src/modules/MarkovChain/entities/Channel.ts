import { Entity, ManyToOne, OneToMany, PrimaryColumn, Column } from 'typeorm'

@Entity('channels')
export class Channel {
    @PrimaryColumn()
    id!: string

    @ManyToOne('Guild', 'channels')
    guild!: any

    @OneToMany('Message', 'channel')
    messages!: any[]
    
    @Column('boolean', { default: false })
    fullyCollected!: boolean
}