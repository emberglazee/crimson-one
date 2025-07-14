import { Logger } from '../util/logger'
const logger = new Logger('AWACSFeed')

import { Client, Events, ChannelType, TextChannel, AuditLogEvent, GuildMember, User, GuildBan, Role } from 'discord.js'
import type { ClientEvents, PartialGuildMember } from 'discord.js'
import { AWACS_FEED_CHANNEL } from '../util/constants'
import { formatDuration, getRandomElement } from '../util/functions'
import { BanishmentManager, type BanishmentEvent, type UnbanishmentEvent } from './BanishmentManager'

const NO_IFF_DATA = '\\\\ NO IFF DATA \\\\'
const TARGET_GUILD_ID = '958518067690868796'
const BANISHED_ROLE_ID = '1331170880591757434'

type EventHandler<T extends keyof ClientEvents> = {
    event: T
    extract: (args: ClientEvents[T], client: Client) => Promise<string[]>
    messages: ((...params: string[]) => string)[]
}

export class AWACSFeed {
    private client: Client
    private awacsChannel: TextChannel | undefined
    private banishmentManager = BanishmentManager.getInstance()

    private static readonly IGNORED_ROLE_IDS = [
        '1371101530819657759',
        '958528919680716881',
        '958522422716416060'
    ]

    private static readonly roleAddMessages = [
        (member: string, role: string, assigner: string) => `✈️ ${member} was assigned to the ${role} squadron${assigner === NO_IFF_DATA ? '.' : ` by ${assigner}.`}`,
        (member: string, role: string, assigner: string) => `🎖️ ${member} has joined the ${role} ranks${assigner === NO_IFF_DATA ? '.' : `, courtesy of ${assigner}.`}`,
        (member: string, role: string, assigner: string) => `✨ ${member} is now part of the ${role} squadron${assigner === NO_IFF_DATA ? '.' : `, thanks to ${assigner}.`}`,
        (member: string, role: string, assigner: string) => `🏷️ ${member} received the ${role} designation${assigner === NO_IFF_DATA ? '.' : ` from ${assigner}.`}`,
        (member: string, role: string, assigner: string) => `🧑‍✈️ ${member} has been promoted to the ${role} unit${assigner === NO_IFF_DATA ? '.' : ` by ${assigner}.`}`
    ]

    private static readonly roleRemoveMessages = [
        (member: string, role: string, remover: string) => `✈️ ${member} was removed from the ${role} squadron${remover === NO_IFF_DATA ? '.' : ` by ${remover}.`}`,
        (member: string, role: string, remover: string) => `🎖️ ${member} has departed the ${role} ranks${remover === NO_IFF_DATA ? '.' : `, decision by ${remover}.`}`,
        (member: string, role: string, remover: string) => `✨ ${member} is no longer part of the ${role} squadron${remover === NO_IFF_DATA ? '.' : `, per ${remover}.`}`,
        (member: string, role: string, remover: string) => `🏷️ ${member}'s ${role} designation was revoked${remover === NO_IFF_DATA ? '.' : ` by ${remover}.`}`,
        (member: string, role: string, remover: string) => `🧑‍✈️ ${member} has been demoted from the ${role} unit${remover === NO_IFF_DATA ? '.' : ` by ${remover}.`}`
    ]

    private static readonly banishedRoleAddMessage = (member: string, assigner: string) => `⛓️ ${member} has been banished${assigner === NO_IFF_DATA ? '.' : ` by ${assigner}.`}`
    private static readonly banishedRoleRemoveMessage = (member: string, remover: string) => `🔓 ${member} has been unbanished${remover === NO_IFF_DATA ? '.' : ` by ${remover}.`}`

    private static readonly timeoutMessages = [
        (member: string, moderator: string) => `🔇 ${member} has been muted${moderator === NO_IFF_DATA ? '.' : ` by ${moderator}.`}`,
        (member: string, moderator: string) => `🔇 ${member} has been silenced${moderator === NO_IFF_DATA ? '.' : ` by ${moderator}.`}`,
        (member: string, moderator: string) => `🔇 ${member} has been timed out${moderator === NO_IFF_DATA ? '.' : ` by ${moderator}.`}`,
        (member: string, moderator: string) => `🔇 ${member} has been sent to the sin bin${moderator === NO_IFF_DATA ? '.' : ` by ${moderator}.`}`
    ]

    private static readonly roleRenameMessages = [
        (oldName: string, newName: string, renamer: string) => `✏️ Squadron ${oldName} was renamed to ${newName}${renamer === NO_IFF_DATA ? '.' : ` by ${renamer}.`}`,
        (oldName: string, newName: string, renamer: string) => `📝 ${oldName} squadron is now known as ${newName}${renamer === NO_IFF_DATA ? '.' : `, updated by ${renamer}.`}`,
        (oldName: string, newName: string, renamer: string) => `🔄 The ${oldName} unit has been redesignated as ${newName}${renamer === NO_IFF_DATA ? '.' : `, thanks to ${renamer}.`}`
    ]

    private static EventHandlers: EventHandler<keyof ClientEvents>[] = [
        {
            event: Events.GuildMemberAdd,
            extract: async ([member]) => [(member as GuildMember).user.username, ''],
            messages: [
                (name: string, _banner: string) => `✅ ${name} has arrived in the AO.`,
                (name: string, _banner: string) => `✅ ${name} has penetrated the CAP line.`,
                (name: string, _banner: string) => `✅ ${name} has taken off the runway.`,
                (name: string, _banner: string) => `✅ ${name} has been deported to Solitary Confinement for freaky behavior.`
            ]
        },
        {
            event: Events.GuildMemberRemove,
            extract: async ([member]) => [(member as GuildMember).user?.username || 'Unknown user', ''],
            messages: [
                (name: string, _banner: string) => `❌ ${name} has retreated out of the AO.`,
                (name: string, _banner: string) => `❌ ${name} has left the AO.`,
                (name: string, _banner: string) => `❌ ${name} has been extracted from the AO.`,
                (name: string, _banner: string) => `❌ ${name} is disengaging.`
            ]
        },
        {
            event: Events.GuildBanAdd,
            extract: async ([ban], _client) => {
                const banned = (ban as GuildBan).user?.username || 'Unknown user'
                let banner = NO_IFF_DATA
                try {
                    const guild = (ban as GuildBan).guild
                    if (guild) {
                        const auditLogs = await guild.fetchAuditLogs({
                            type: AuditLogEvent.MemberBanAdd,
                            limit: 5
                        })
                        const entry = auditLogs.entries.find(e => e.target?.id === (ban as GuildBan).user?.id)
                        if (entry && entry.executor) {
                            banner = entry.executor.username ?? NO_IFF_DATA
                        }
                    }
                } catch { /* ignore */ }
                return [banned, banner]
            },
            messages: [
                (banned, banner) => `🔨 ${banned} was blown up${banner === NO_IFF_DATA ? '.' : ` by ${banner}`}`,
                (banned, banner) => `🔨 ${banned} was slain${banner === NO_IFF_DATA ? '.' : ` by ${banner}`}`,
                (banned, banner) => `🔨 ${banned} was shot down${banner === NO_IFF_DATA ? '.' : ` by ${banner}`}`,
                (banned, banner) => `🔨 ${banned} was sent to the gulag${banner === NO_IFF_DATA ? '.' : ` by ${banner}`}`,
                (banned, banner) => `🔨 ${banned} has been neutralized${banner === NO_IFF_DATA ? '.' : ` by ${banner}`}`
            ]
        },
        {
            event: Events.GuildRoleCreate,
            extract: async ([role], _client) => {
                const createdRole = role as Role
                let creator = NO_IFF_DATA
                try {
                    const guild = createdRole.guild
                    if (guild) {
                        const auditLogs = await guild.fetchAuditLogs({
                            type: AuditLogEvent.RoleCreate,
                            limit: 5
                        })
                        const entry = auditLogs.entries.find(e => e.target?.id === createdRole.id)
                        if (entry && entry.executor) {
                            creator = entry.executor.username ?? NO_IFF_DATA
                        }
                    }
                } catch { /* ignore */ }
                return [createdRole.name, creator]
            },
            messages: [
                (role: string, creator: string) => `✨ Squadron ${role} was created${creator === NO_IFF_DATA ? '.' : ` by ${creator}`}.`,
                (role: string, creator: string) => `➕ New Squadron ${role} added${creator === NO_IFF_DATA ? '.' : ` by ${creator}`}.`,
                (role: string, creator: string) => `🛠️ ${creator === NO_IFF_DATA ? `Someone` : creator} formed the ${role} squadron.`
            ]
        },
        {
            event: Events.GuildRoleDelete,
            extract: async ([role], _client) => {
                const deletedRole = role as Role
                let deleter = NO_IFF_DATA
                try {
                    const guild = deletedRole.guild
                    if (guild) {
                        const auditLogs = await guild.fetchAuditLogs({
                            type: AuditLogEvent.RoleDelete,
                            limit: 5
                        })
                        const entry = auditLogs.entries.find(e => e.target?.id === deletedRole.id)
                        if (entry && entry.executor) {
                            deleter = entry.executor.username ?? NO_IFF_DATA
                        }
                    }
                } catch { /* ignore */ }
                return [deletedRole.name, deleter]
            },
            messages: [
                (role: string, deleter: string) => `🗑️ Squadron ${role} was deleted${deleter === NO_IFF_DATA ? '.' : ` by ${deleter}`}.`,
                (role: string, deleter: string) => `➖ Squadron ${role} was disbanded${deleter === NO_IFF_DATA ? '.' : ` by ${deleter}`}.`,
                (role: string, deleter: string) => `🔥 ${deleter === NO_IFF_DATA ? `Someone` : deleter} incinerated the ${role} squadron.`
            ]
        },
        {
            event: Events.GuildRoleUpdate,
            extract: async ([oldRole, newRole], _client) => {
                const oldR = oldRole as Role
                const newR = newRole as Role
                let renamer = NO_IFF_DATA

                if (oldR.name !== newR.name) {
                    try {
                        const guild = newR.guild
                        if (guild) {
                            const auditLogs = await guild.fetchAuditLogs({
                                type: AuditLogEvent.RoleUpdate,
                                limit: 5
                            })
                            const entry = auditLogs.entries.find(e =>
                                e.target?.id === newR.id &&
                                e.changes.some(change => change.key === 'name' && change.old === oldR.name && change.new === newR.name)
                            )
                            if (entry && entry.executor) {
                                renamer = entry.executor.username ?? NO_IFF_DATA
                            }
                        }
                    } catch { /* ignore */ }
                    return [oldR.name, newR.name, renamer]
                }
                return [] // No name change
            },
            messages: AWACSFeed.roleRenameMessages
        }
    ]

    constructor(client: Client) {
        this.client = client
        this.initializeListeners()
    }

    private isTargetGuild(guildId: string): boolean {
        return guildId === TARGET_GUILD_ID
    }

    private async initializeListeners() {
        // Handle the simple events first
        for (const handler of AWACSFeed.EventHandlers) {
            this.client.on(handler.event, async (...args: ClientEvents[keyof ClientEvents]) => {
                const guildSource = args[0] as { guild?: { id: string } }
                const guild = guildSource.guild
                if (!guild || !this.isTargetGuild(guild.id)) return

                const params = await handler.extract(args, this.client)
                if (params.length === 0) return

                const message = getRandomElement(handler.messages)(...params)
                await this.sendMessage(message)
            })
        }

        // Then handle the complex event separately
        this.client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
            if (!this.isTargetGuild(newMember.guild.id)) return
            this.handleGuildMemberUpdate(oldMember, newMember)
        })

        // Banishment Manager listeners
        this.banishmentManager.on('userBanished', data => this.onUserBanished(data))
        this.banishmentManager.on('userUnbanished', data => this.onUserUnbanished(data))
    }

    private onUserBanished(data: BanishmentEvent) {
        const { member, actor, type, duration, reason } = data
        let message = `⛓️ ${member.user.username} has been banished by ${actor.username} via ${type}.`
        if (duration) {
            const durationInSeconds = Number(duration)
            const releaseDate = new Date(Date.now() + durationInSeconds * 1000)
            const releaseDateString = releaseDate.toLocaleString('en-GB', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                timeZone: 'Europe/London',
                timeZoneName: 'short'
            })
            message += ` Duration: ${formatDuration(durationInSeconds)} (until ${releaseDateString}).`
        }
        if (reason) {
            message += ` Reason: ${reason}`
        }
        this.sendMessage(message)
    }

    private onUserUnbanished(data: UnbanishmentEvent) {
        const { member, actor, type, reason } = data
        let message = `🔓 ${member.user.username} has been unbanished by ${actor.username} via ${type}.`
        if (reason) {
            message += ` Reason: ${reason}`
        }
        this.sendMessage(message)
    }

    private async handleGuildMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
        if (newMember.user.bot || this.banishmentManager.isActionInProgress(newMember.id)) return

        await this.handleRoleChanges(oldMember, newMember)
        await this.handleTimeoutChanges(oldMember, newMember)
    }

    private async handleRoleChanges(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
        const oldRoleIds = new Set(oldMember.roles?.cache.map(r => r.id) || [])
        const addedRoles = newMember.roles.cache.filter(role => !oldRoleIds.has(role.id))
        const removedRoles = oldMember.roles?.cache.filter(role => !newMember.roles.cache.has(role.id))

        for (const role of addedRoles.values()) {
            if (role.id === BANISHED_ROLE_ID) {
                const assigner = await this.findRoleChanger(newMember, role, '$add')
                if (assigner !== NO_IFF_DATA) {
                    const actor = await this.client.users.fetch(assigner).catch(() => null)
                    if(actor) this.banishmentManager.reportManualBanishment(newMember, actor)
                }
            } else if (!AWACSFeed.IGNORED_ROLE_IDS.includes(role.id)) {
                const assigner = await this.findRoleChanger(newMember, role, '$add')
                const message = getRandomElement(AWACSFeed.roleAddMessages)(newMember.user.username, role.name, assigner)
                await this.sendMessage(message)
            }
        }

        for (const role of removedRoles.values()) {
            if (role.id === BANISHED_ROLE_ID) {
                const remover = await this.findRoleChanger(newMember, role, '$remove')
                if (remover !== NO_IFF_DATA) {
                    const actor = await this.client.users.fetch(remover).catch(() => null)
                    if(actor) this.banishmentManager.reportManualUnbanishment(newMember, actor)
                }
            } else if (!AWACSFeed.IGNORED_ROLE_IDS.includes(role.id)) {
                const remover = await this.findRoleChanger(newMember, role, '$remove')
                const message = getRandomElement(AWACSFeed.roleRemoveMessages)(newMember.user.username, role.name, remover)
                await this.sendMessage(message)
            }
        }
    }

    private async handleTimeoutChanges(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
        const oldTimeout = oldMember.communicationDisabledUntil
        const newTimeout = newMember.communicationDisabledUntil

        if (oldTimeout !== newTimeout) {
            const moderator = await this.findTimeoutChanger(newMember)
            if (moderator === NO_IFF_DATA) {
                // If no specific timeout audit log entry is found,
                // it means this communicationDisabledUntil change was not a direct timeout action.
                // This can happen if other member updates implicitly change this property.
                return
            }

            if (newTimeout) { // User was timed out
                const message = getRandomElement(AWACSFeed.timeoutMessages)(newMember.user.username, moderator)
                await this.sendMessage(message)
            } else if (oldTimeout) { // User was untimed out
                const message = `🔊 ${newMember.user.username} has been unmuted${moderator === NO_IFF_DATA ? '.' : ` by ${moderator}`}.`
                await this.sendMessage(message)
            }
        }
    }

    private async findRoleChanger(member: GuildMember, role: Role, changeKey: '$add' | '$remove'): Promise<string> {
        try {
            const auditLogs = await member.guild.fetchAuditLogs({
                limit: 10,
                type: AuditLogEvent.MemberRoleUpdate,
            })

            const logEntry = auditLogs.entries.find(entry => {
                if (entry.target?.id !== member.id) return false

                // Iterate through changes and find the relevant one
                return entry.changes.some(change => {
                    // Check if change.key exists and is 'roles'
                    if (change && typeof change === 'object' && 'key' in change && (change.key === '$add' || change.key === '$remove')) {
                        const roleChange = change as { key: '$add' | '$remove', new?: { id: string }[], old?: { id: string }[] }

                        if (changeKey === '$add' && roleChange.new) {
                            return roleChange.new.some(newRole => newRole.id === role.id)
                        } else if (changeKey === '$remove' && roleChange.old) {
                            return roleChange.old.some(oldRole => oldRole.id === role.id)
                        }
                    }
                    return false
                })
            })

            if (logEntry?.executor) {
                return logEntry.executor.username ?? NO_IFF_DATA
            }
        } catch (error) {
            logger.warn(`[AWACSFeed] Error fetching audit logs for ${member.user.tag} role change: ${error instanceof Error ? error.message : String(error)}`)
        }
        return NO_IFF_DATA
    }

    private async findTimeoutChanger(member: GuildMember | User): Promise<string> {
        try {
            const guild = (member instanceof GuildMember) ? member.guild : null
            if (!guild) return NO_IFF_DATA

            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberUpdate,
                limit: 10
            })

            const logEntry = auditLogs.entries.find(entry =>
                entry.target?.id === member.id &&
                entry.changes.some(change => change.key === 'communication_disabled_until')
            )

            if (logEntry?.executor) {
                return logEntry.executor.username ?? NO_IFF_DATA
            }
        } catch (error) {
            const username = (member instanceof GuildMember) ? member.user.username : member.username
            logger.warn(`[AWACSFeed] Error fetching audit logs for ${username} timeout change: ${error instanceof Error ? error.message : String(error)}`)
        }
        return NO_IFF_DATA
    }

    private async sendMessage(message: string) {
        if (!this.awacsChannel) {
            const channel = await this.client.channels.fetch(AWACS_FEED_CHANNEL)
            if (channel?.isTextBased() && channel.type === ChannelType.GuildText) {
                this.awacsChannel = channel
            } else {
                logger.warn(`Could not find AWACS feed channel with ID: ${AWACS_FEED_CHANNEL}`)
                return
            }
        }
        await this.awacsChannel!.send(message)
    }
}
