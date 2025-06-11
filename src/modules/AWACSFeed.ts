import { Logger } from '../util/logger'
const logger = new Logger('AWACSFeed')

import { Client, Events, ChannelType, TextChannel, AuditLogEvent, GuildMember } from 'discord.js'
import type { ClientEvents, PartialGuildMember, Role } from 'discord.js'
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

// Messages can be defined outside to be reused in the unified handler
const roleAddMessages = [
    (member: string, role: string, assigner: string) => `✈️ ${member} was assigned to the ${role} squadron by ${assigner}.`,
    (member: string, role: string, assigner: string) => `🎖️ ${member} has joined the ${role} ranks, courtesy of ${assigner}.`,
    (member: string, role: string, assigner: string) => `✨ ${member} is now part of the ${role} squadron, thanks to ${assigner}.`,
    (member: string, role: string, assigner: string) => `🏷️ ${member} received the ${role} designation from ${assigner}.`,
    (member: string, role: string, assigner: string) => `🧑‍✈️ ${member} has been promoted to the ${role} unit by ${assigner}.`
]

const roleRemoveMessages = [
    (member: string, role: string, remover: string) => `✈️ ${member} was removed from the ${role} squadron by ${remover}.`,
    (member: string, role: string, remover: string) => `🎖️ ${member} has departed the ${role} ranks, decision by ${remover}.`,
    (member: string, role: string, remover: string) => `✨ ${member} is no longer part of the ${role} squadron, per ${remover}.`,
    (member: string, role: string, remover: string) => `🏷️ ${member}'s ${role} designation was revoked by ${remover}.`,
    (member: string, role: string, remover: string) => `🧑‍✈️ ${member} has been demoted from the ${role} unit by ${remover}.`
]


export class AWACSFeed {
    private client: Client
    private awacsChannel: TextChannel | undefined

    private static UnifiedGuildMemberUpdateHandler = {
        async handler(this: AWACSFeed, oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
            if (newMember.user.bot) return

            // --- Check for added roles ---
            const oldRoleIds = new Set(oldMember.roles?.cache.map(r => r.id) || [])
            const addedRoles = newMember.roles.cache.filter(role => !oldRoleIds.has(role.id))

            if (addedRoles.size > 0) {
                const roleAdded = addedRoles.first()
                if (roleAdded) {
                    const assigner = await AWACSFeed.findRoleChanger(newMember, roleAdded, '$add')
                    const message = getRandomElement(roleAddMessages)(newMember.user.username, roleAdded.name, assigner)
                    await this.sendMessage(message)
                    return
                }
            }

            // --- Check for removed roles ---
            const newRoleIds = new Set(newMember.roles.cache.map(r => r.id))
            const removedRoles = oldMember.roles?.cache.filter(role => !newRoleIds.has(role.id))

            if (removedRoles && removedRoles.size > 0) {
                const roleRemoved = removedRoles.first()
                if (roleRemoved) {
                    const remover = await AWACSFeed.findRoleChanger(newMember, roleRemoved, '$remove')
                    const message = getRandomElement(roleRemoveMessages)(newMember.user.username, roleRemoved.name, remover)
                    await this.sendMessage(message)
                    return
                }
            }
        }
    }

    private static async findRoleChanger(member: GuildMember, role: Role, changeKey: '$add' | '$remove'): Promise<string> {
        try {
            const auditLogs = await member.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberRoleUpdate,
                limit: 10
            })

            const changeProp = changeKey === '$add' ? 'new' : 'old'

            const logEntry = auditLogs.entries.find(entry =>
                entry.target?.id === member.id &&
                entry.changes.some(change =>
                    change.key === changeKey &&
                    (change[changeProp] as { id: string }[])?.some(r => r.id === role.id)
                )
            )

            if (logEntry?.executor) {
                return logEntry.executor.username ?? '`\\\\ INVALID IFF DATA \\\\`'
            }
        } catch (error) {
            logger.warn(`[AWACSFeed] Error fetching audit logs for ${member.user.tag} role change: ${error instanceof Error ? error.message : String(error)}`)
        }
        return '`\\\\ NO IFF DATA \\\\`'
    }

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
    ]

    constructor(client: Client) {
        this.client = client
        this.initializeListeners()
    }

    private async initializeListeners() {
        // Handle the simple events first
        for (const handler of AWACSFeed.EventHandlers) {
            this.client.on(handler.event, async (...args: ClientEvents[keyof ClientEvents]) => {
                const guildSource = handler.event === Events.GuildBanAdd ? args[0] : args[0]
                const guild = (guildSource as { guild?: { id: string } })?.guild
                if (!guild || guild.id !== '958518067690868796') return

                const params = await handler.extract(args, this.client)
                if (params.length === 0) return

                const message = getRandomElement(handler.messages)(...params)
                await this.sendMessage(message)
            })
        }

        // Then handle the complex event separately
        this.client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
            if (newMember.guild.id !== '958518067690868796') return
            AWACSFeed.UnifiedGuildMemberUpdateHandler.handler.call(this, oldMember, newMember)
        })
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
