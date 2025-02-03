import { Client, PermissionsBitField } from 'discord.js'
import { Logger } from '../../util/logger'
const logger = new Logger('CommandParser')

export class CommandParser {
    private client: Client | null = null

    setClient(client: Client) {
        this.client = client
    }

    async parseCommand(text: string): Promise<string | null> {
        if (!this.client) throw new Error('Client not set')

        const commandRegex = /!(fetchRoles|fetchBotRoles|fetchUser|getRichPresence|ignore|getEmojis)(?:\(([^)]+)\))?/
        const match = commandRegex.exec(text)
        if (!match) return null

        const [fullMatch, command, params] = match
        let finalUsername = params?.trim() || ''

        switch (command) {
            case 'fetchRoles':
                if (!finalUsername) return 'Error: Username required'
                const member = await this.client.users.cache
                    .find(u => u.username === finalUsername)
                    ?.fetch()
                if (!member) return `Could not find user: ${finalUsername}`
                const guildMember = await this.client.guilds.cache
                    .first()
                    ?.members.fetch(member)
                return guildMember?.roles.cache.map(r => r.name).join(', ') || 'No roles found'

            case 'fetchBotRoles':
                const guild = this.client.guilds.cache.first()
                if (!guild) return 'No guild found'
                const botMember = await guild.members.fetchMe()
                const permissions = botMember.permissions
                const permissionNames = new PermissionsBitField(permissions).toArray()
                return JSON.stringify({
                    roles: botMember.roles.cache.map(r => r.name),
                    permissions: permissionNames
                }, null, 2)

            case 'fetchUser':
                if (!finalUsername) return 'Error: Username required'
                const user = await this.client.users.cache
                    .find(u => u.username === finalUsername)
                    ?.fetch()
                if (!user) return `Could not find user: ${finalUsername}`
                return JSON.stringify({
                    username: user.username,
                    displayName: user.displayName,
                    createdAt: user.createdAt
                })

            case 'getRichPresence':
                if (!finalUsername) return 'Error: Username required'
                const presenceUser = await this.client.users.cache
                    .find(u => u.username === finalUsername)
                    ?.fetch()
                if (!presenceUser) return `Could not find user: ${finalUsername}`
                const presence = await this.client.guilds.cache
                    .first()
                    ?.members.fetch(presenceUser)
                    ?.then(m => m.presence)
                return presence ? JSON.stringify(presence.activities) : 'User is offline'

            case 'getEmojis':
                return JSON.stringify(
                    Array.from(this.client.emojis.cache.values())
                        .map(e => ({ name: e.name, id: e.id }))
                )

            case 'ignore':
                return null

            default:
                return `Unknown command: ${command}`
        }
    }
}
