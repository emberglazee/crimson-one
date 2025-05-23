import { Entity, PrimaryColumn, Column } from 'typeorm'

export interface IGuildConfig {
    guildId: string
    prefix: string
    messageTrigger: boolean
}

@Entity('guild_configs')
export class GuildConfig implements IGuildConfig {
    @PrimaryColumn('varchar')
    guildId: string = ''

    @Column('varchar', { default: 'c1' })
    prefix: string = 'c1'

    @Column('boolean', { default: false })
    messageTrigger: boolean = false
}
