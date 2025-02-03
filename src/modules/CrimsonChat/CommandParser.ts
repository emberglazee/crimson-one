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

        // Check if text is a command or contains one
        if (!text.includes('!')) return null

        const commandRegex = /!(fetchRoles|fetchBotRoles|fetchUser|getRichPresence|ignore|getEmojis)(?:\(([^)]+)\))?/
        const match = commandRegex.exec(text)
        if (!match) return null

        const [fullMatch, command, params] = match
        let finalUsername = params?.trim() || ''

        try {
            const guild = this.client.guilds.cache.first()
            if (!guild) return 'Error: No guild available'

            switch (command) {
                case 'fetchRoles':
                    if (!finalUsername) return 'Error: Username required'
                    const user = this.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!user) return `Error: Could not find user "${finalUsername}"`
                    
                    const guildMember = await guild.members.fetch(user.id)
                    const roles = guildMember?.roles.cache.map(r => r.name) || []
                    return JSON.stringify({ roles }, null, 2)

                case 'fetchBotRoles':
                    const botMember = await guild.members.fetchMe()
                    const permissions = new PermissionsBitField(botMember.permissions).toArray()
                    return JSON.stringify({
                        roles: botMember.roles.cache.map(r => r.name),
                        permissions
                    }, null, 2)

                case 'fetchUser':
                    if (!finalUsername) return 'Error: Username required'
                    const targetUser = this.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!targetUser) return `Error: Could not find user "${finalUsername}"`
                    
                    return JSON.stringify({
                        username: targetUser.username,
                        displayName: targetUser.displayName,
                        createdAt: targetUser.createdAt,
                        id: targetUser.id
                    }, null, 2)

                case 'getRichPresence':
                    if (!finalUsername) return 'Error: Username required'
                    const presenceUser = this.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!presenceUser) return `Error: Could not find user "${finalUsername}"`
                    
                    const member = await guild.members.fetch(presenceUser.id)
                    const activities = member.presence?.activities || []
                    return JSON.stringify(activities.map(a => ({
                        name: a.name,
                        type: a.type,
                        state: a.state,
                        details: a.details,
                        createdAt: a.createdAt
                    })), null, 2)

                case 'getEmojis':
                    const emojis = Array.from(this.client.emojis.cache.values())
                        .map(e => ({ name: e.name, id: e.id }))
                    return JSON.stringify({ emojis }, null, 2)

                case 'ignore':
                    return null

                default:
                    return `Error: Unknown command "${command}"`
            }
        } catch (error) {
            logger.error(`Error processing command ${command}: ${error}`)
            return `Error processing command "${command}": ${error instanceof Error ? error.message : 'Unknown error'}`
        }
    }
}
