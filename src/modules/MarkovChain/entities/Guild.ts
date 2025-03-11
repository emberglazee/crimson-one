import { Entity, OneToMany, PrimaryColumn, Column } from 'typeorm'
import { Channel } from './Channel'

@Entity('guilds')
export class Guild {
  @PrimaryColumn()
  id!: string

  @Column()
  name!: string

  @OneToMany(() => Channel, channel => channel.guild)
  channels!: Channel[]
}