import { Entity, PrimaryColumn, Column } from 'typeorm'

export type PlatformType = 'discord' | 'stoat'

export interface IServerConfig {
    serverId: string
    platform: PlatformType
    prefix: string
    messageTrigger: boolean
    tagSystemEnabled: boolean
    tagCreateRoles: string[]
    tagCreateUsers: string[]
    tagCreatePermissions: string[]
    markovBotWhitelistedChannels: string[]
}

/**
 * Server configuration entity supporting both Discord guilds and Stoat servers
 */
@Entity('guild_configs')
export class ServerConfig implements IServerConfig {
    @PrimaryColumn('varchar')
    serverId: string = ''

    @PrimaryColumn('varchar', { default: 'discord' })
    platform: PlatformType = 'discord'

    @Column('varchar', { default: 'c1!' })
    prefix: string = 'c1!'

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

    @Column('simple-array', { default: '' })
    markovBotWhitelistedChannels: string[] = []
}
