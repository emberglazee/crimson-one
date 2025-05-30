import { Logger } from '../util/logger'
const logger = new Logger('AWACSFeed')

import { Client, Events, ChannelType, TextChannel, AuditLogEvent, GuildMember } from 'discord.js'
import type { ClientEvents, PartialGuildMember } from 'discord.js'
import { AWACS_FEED_CHANNEL } from '../util/constants'
import { getRandomElement } from '../util/functions'
import type { ExplicitAny } from '../types/types'

type EventHandler<T extends keyof ClientEvents> = {
    event: T
    extract: (args: ClientEvents[T], client: Client) => Promise<string[]>
    messages: ((...params: string[]) => string)[]
}

type ExtractableUser = {
    user: {
        username: string
    }
}

export class AWACSFeed {
    private client: Client

    private static EventHandlers: EventHandler<keyof ClientEvents>[] = [
        {
            event: Events.GuildMemberAdd,
            extract: async ([member]) => [(member as ExtractableUser).user.username, ''],
            messages: [
                (name: string) => `✅ ${name} has arrived in the AO.`,
                (name: string) => `✅ ${name} has penetrated the CAP line.`,
                (name: string) => `✅ ${name} has taken off the runway.`,
                (name: string) => `✅ ${name} has been deported to Solitary Confinement for freaky behavior.`
            ].map(fn => (name, _banner) => fn(name))
        },
        {
            event: Events.GuildMemberRemove,
            extract: async ([member]) => [(member as ExtractableUser).user?.username || 'Unknown user', ''],
            messages: [
                (name: string) => `❌ ${name} has retreated out of the AO.`,
                (name: string) => `❌ ${name} has left the AO.`,
                (name: string) => `❌ ${name} has been extracted from the AO.`,
                (name: string) => `❌ ${name} is disengaging.`
            ].map(fn => (name, _banner) => fn(name))
        },
        {
            event: Events.GuildBanAdd,
            extract: async ([ban], _client) => {
                const banned = (ban as ExtractableUser).user.username
                let banner = '\\\\ NO IFF DATA \\\\'
                try {
                    const guild = (ban as ExplicitAny).guild
                    if (guild) {
                        const auditLogs = await guild.fetchAuditLogs({
                            type: AuditLogEvent.MemberBanAdd,
                            limit: 5
                        })
                        const entry = auditLogs.entries.find((e: ExplicitAny) => e.target?.id === (ban as ExplicitAny).user.id)
                        if (entry && entry.executor) {
                            banner = entry.executor.username
                        }
                    }
                } catch { /* ignore */ }
                return [banned, banner]
            },
            messages: [
                (banned, banner) => `🔨 ${banned} was blown up by ${banner}`,
                (banned, banner) => `🔨 ${banned} was slain by ${banner}`,
                (banned, banner) => `🔨 ${banned} was shot down by ${banner}`,
                (banned, banner) => `🔨 ${banned} was sent to the gulag by ${banner}`,
                (banned, banner) => `🔨 ${banned} has breached containment by ${banner}`,
                (banned, banner) => `🔨 ${banned} has been neutralized by ${banner}`,
                (banned, banner) => `🔨 ${banned} smoked ${banner}'s cordium blunt and spontaneously combusted`
            ]
        },
        {
            event: Events.GuildMemberUpdate,
            extract: async ([oldMember, newMember], _client: Client): Promise<string[]> => {
                const oldM = oldMember as GuildMember | PartialGuildMember
                const newM = newMember as GuildMember

                const oldRoleIds = new Set(oldM.roles?.cache.map(r => r.id) || [])
                const addedRoles = newM.roles.cache.filter(role => !oldRoleIds.has(role.id))

                if (addedRoles.size === 0) return []

                const roleAdded = addedRoles.first()
                if (!roleAdded) return []

                const memberUsername = newM.user.username
                const roleName = roleAdded.name
                let assignerUsername = '\\\\\\\\ NO IFF DATA \\\\\\\\'

                try {
                    const guild = newM.guild
                    if (guild) {
                        const auditLogs = await guild.fetchAuditLogs({
                            type: AuditLogEvent.MemberRoleUpdate,
                            limit: 10
                        })

                        const logEntry = auditLogs.entries.find(entry =>
                            entry.target?.id === newM.id &&
                            entry.action === AuditLogEvent.MemberRoleUpdate &&
                            entry.changes.some(change =>
                                change.key === '$add' &&
                                (change.new as {id: string, name: string}[])?.some(r => r.id === roleAdded.id)
                            )
                        )

                        if (logEntry && logEntry.executor && logEntry.executor.username) {
                            assignerUsername = logEntry.executor.username
                        }
                    }
                } catch (error) {
                    logger.warn(`[AWACSFeed] Error fetching audit logs for ${newM.user.tag} role update: ${error instanceof Error ? error.message : String(error)}`)
                }

                return [memberUsername, roleName, assignerUsername]
            },
            messages: [
                (member, role, assigner) => `✈️ ${member} was assigned to the ${role} squadron by ${assigner}.`,
                (member, role, assigner) => `🎖️ ${member} has joined the ${role} ranks, courtesy of ${assigner}.`,
                (member, role, assigner) => `✨ ${member} is now part of the ${role} squadron, thanks to ${assigner}.`,
                (member, role, assigner) => `🏷️ ${member} received the ${role} designation from ${assigner}.`,
                (member, role, assigner) => `🧑‍✈️ ${member} has been promoted to the ${role} unit by ${assigner}.`
            ]
        },
        {
            event: Events.GuildMemberUpdate,
            extract: async ([oldMember, newMember], _client: Client): Promise<string[]> => {
                const oldM = oldMember as GuildMember | PartialGuildMember
                const newM = newMember as GuildMember

                const newRoleIds = new Set(newM.roles.cache.map(r => r.id))
                const removedRoles = oldM.roles?.cache.filter(role => !newRoleIds.has(role.id)) || new Map()

                if (removedRoles.size === 0) return []
                if (newM.user.bot) return []

                const roleRemoved = removedRoles.first()
                if (!roleRemoved) return []

                const memberUsername = newM.user.username
                const roleName = roleRemoved.name
                let removerUsername = '\\\\\\\\ NO IFF DATA \\\\\\\\' // escape for js and then markdown, resulting in "\\ NO IFF DATA \\"

                try {
                    const guild = newM.guild
                    if (guild) {
                        const auditLogs = await guild.fetchAuditLogs({
                            type: AuditLogEvent.MemberRoleUpdate,
                            limit: 10
                        })

                        const logEntry = auditLogs.entries.find(entry =>
                            entry.target?.id === newM.id &&
                            entry.action === AuditLogEvent.MemberRoleUpdate &&
                            entry.changes.some(change =>
                                change.key === '$remove' &&
                                (change.old as {id: string, name: string}[])?.some(r => r.id === roleRemoved.id)
                            )
                        )

                        if (logEntry && logEntry.executor && logEntry.executor.username) {
                            removerUsername = logEntry.executor.username
                        }
                    }
                } catch (error) {
                    logger.warn(`[AWACSFeed] Error fetching audit logs for ${newM.user.tag} role removal: ${error instanceof Error ? error.message : String(error)}`)
                }

                return [memberUsername, roleName, removerUsername]
            },
            messages: [
                (member, role, remover) => `✈️ ${member} was removed from the ${role} squadron by ${remover}.`,
                (member, role, remover) => `🎖️ ${member} has departed the ${role} ranks, decision by ${remover}.`,
                (member, role, remover) => `✨ ${member} is no longer part of the ${role} squadron, per ${remover}.`,
                (member, role, remover) => `🏷️ ${member}'s ${role} designation was revoked by ${remover}.`,
                (member, role, remover) => `🧑‍✈️ ${member} has been demoted from the ${role} unit by ${remover}.`
            ]
        }
    ]

    constructor(client: Client) {
        this.client = client
        for (const handler of AWACSFeed.EventHandlers) {
            this.client.on(handler.event, async (...args: ClientEvents[keyof ClientEvents]) => {
                const guildSource = handler.event === Events.GuildMemberUpdate ? args[1] : args[0]
                const guild = (guildSource as { guild?: { id: string } })?.guild

                if (!guild || guild.id !== '958518067690868796') return

                const params = await handler.extract(args, this.client)
                if (params.length === 0) return

                const message = getRandomElement(handler.messages)(...params)
                const channel = await this.client.channels.fetch(AWACS_FEED_CHANNEL)
                if (channel?.isTextBased() && channel.type === ChannelType.GuildText) {
                    await (channel as TextChannel).send(message)
                }
            })
        }
    }
}
