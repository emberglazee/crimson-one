import { Entity, PrimaryColumn, Column } from 'typeorm'

export interface IGuildConfig {
    guildId: string
    prefix: string
    messageTrigger: boolean
    tagSystemEnabled: boolean
    tagCreateRoles: string[]
    tagCreateUsers: string[]
    tagCreatePermissions: string[]
}

@Entity('guild_configs')
export class GuildConfig implements IGuildConfig {
    @PrimaryColumn('varchar')
    guildId: string = ''

    @Column('varchar', { default: 'c1' })
    prefix: string = 'c1'

    @Column('boolean', { default: false })
    messageTrigger: boolean = false

    @Column('boolean', { default: false })
    tagSystemEnabled: boolean = false

    @Column('simple-array', { default: '' })
    tagCreateRoles: string[] = []

    @Column('simple-array', { default: '' })
    tagCreateUsers: string[] = []

    @Column('simple-array', { default: '' })
    tagCreatePermissions: string[] = []
}
