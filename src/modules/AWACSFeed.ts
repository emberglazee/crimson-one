import { Client, Events, GuildMember, GuildBan, ChannelType, TextChannel } from 'discord.js'
import type { PartialGuildMember, ClientEvents } from 'discord.js'
import { AWACS_FEED_CHANNEL } from '../util/constants'
import { randArr } from '../util/functions'

export class AWACSFeed {
    private client: Client

    private static EventHandlers = [
        {
            event: Events.GuildMemberAdd,
            extract: (member: GuildMember) => [member.user.username],
            messages: [
                (name: string) => `${name} has arrived in the AO.`,
                (name: string) => `${name} has penetrated the CAP line.`,
                (name: string) => `${name} has taken off the runway.`,
                (name: string) => `${name} has been deported to Solitary Confinement for freaky behavior.`
            ]
        },
        {
            event: Events.GuildMemberRemove,
            extract: (member: GuildMember | PartialGuildMember) => [member.user?.username || 'Unknown user'],
            messages: [
                (name: string) => `${name} has retreated out of the AO.`,
                (name: string) => `${name} has left the AO.`,
                (name: string) => `${name} has been extracted from the AO.`,
                (name: string) => `${name} is disengaging.`
            ]
        },
        {
            event: Events.GuildBanAdd,
            extract: (ban: GuildBan) => [ban.user.username],
            messages: [
                (name: string) => `${name} blew up.`,
                (name: string) => `${name} was slain.`,
                (name: string) => `${name} was shot down.`,
                (name: string) => `${name} was sent to the gulag.`,
                (name: string) => `${name} has breached containment.`,
                (name: string) => `${name} has been neutralized.`,
                (name: string) => `${name} stalled and crashed.`,
                (name: string) => `${name} ejected way too close to the ground.`,
                (name: string) => `${name} tried to smoke a cordium blunt and spontaneously combusted.`
            ]
        }
    ]

    constructor(client: Client) {
        this.client = client
        for (const handler of AWACSFeed.EventHandlers) {
            this.client.on(handler.event as keyof ClientEvents, async (...args: any[]) => {
                const params = handler.extract(args[0])
                const message = randArr(handler.messages)(params[0])
                const channel = await this.client.channels.fetch(AWACS_FEED_CHANNEL)
                if (channel?.isTextBased() && channel.type === ChannelType.GuildText) {
                    await (channel as TextChannel).send(message)
                }
            })
        }
    }
}
