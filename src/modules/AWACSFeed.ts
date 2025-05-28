import { Client, Events, ChannelType, TextChannel, AuditLogEvent } from 'discord.js'
import type { ClientEvents } from 'discord.js'
import { AWACS_FEED_CHANNEL } from '../util/constants'
import { getRandomElement } from '../util/functions'
import type { ExplicitAny } from '../types/types'

type EventHandler<T extends keyof ClientEvents> = {
    event: T
    extract: (args: ClientEvents[T], client: Client) => Promise<string[]>
    messages: ((banned: string, banner: string) => string)[]
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
                let banner = 'Unknown banner'
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
        }
    ]

    constructor(client: Client) {
        this.client = client
        for (const handler of AWACSFeed.EventHandlers) {
            this.client.on(handler.event, async (...args) => {
                // Ignore event if not from the specified guild
                const guild = (args[0] as { guild: { id: string } }).guild
                if (!guild || guild.id !== '958518067690868796') return

                const params = await handler.extract(args as ClientEvents[keyof ClientEvents], this.client)
                const message = getRandomElement(handler.messages)(params[0], params[1])
                const channel = await this.client.channels.fetch(AWACS_FEED_CHANNEL)
                if (channel?.isTextBased() && channel.type === ChannelType.GuildText) {
                    await (channel as TextChannel).send(message)
                }
            })
        }
    }
}
