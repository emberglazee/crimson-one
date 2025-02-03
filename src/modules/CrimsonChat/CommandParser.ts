import { PermissionsBitField, ChannelType } from 'discord.js'
import { Logger } from '../../util/logger'
import { ASSISTANT_COMMANDS } from '../../util/constants'
import CrimsonChat from '.'
const logger = new Logger('CommandParser')

export class CommandParser {
    private crimsonChat = CrimsonChat.getInstance()

    async parseCommand(text: string): Promise<string | null> {
        if (!this.crimsonChat.client) {
            logger.error('[Command Parser] Client not set')
            throw new Error('Client not set')
        }

        logger.info(`[Command Parser] Processing command text: ${text}`)

        const commandRegex = /!(fetchRoles|fetchBotRoles|fetchUser|getRichPresence|ignore|getEmojis|createChannel)(?:\(([^)]*)\))?/
        const match = commandRegex.exec(text)

        if (!match) {
            logger.info('[Command Parser] No command pattern found')
            return null
        }

        const [fullMatch, command, params] = match
        logger.info(`[Command Parser] Matched command: ${command}, params: ${params}`)
        
        let finalUsername = params?.trim() || ''

        try {
            const guild = this.crimsonChat.client.guilds.cache.first()
            if (!guild) {
                logger.error('[Command Parser] No guild available')
                return 'Error: No guild available'
            }

            logger.info(`[Command Parser] Processing command ${command} with username: ${finalUsername}`)

            const moderationCommand = async (
                permissionRequired: PermissionsBitField,
                action: () => Promise<any>,
                successMessage: string
            ) => {
                const member = await guild.members.fetchMe()
                if (!member.permissions.has(permissionRequired)) {
                    return `Error: Missing required permission: ${permissionRequired}`
                }

                try {
                    await action()
                    return successMessage
                } catch (error) {
                    return `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
            }

            switch (command) {
                case ASSISTANT_COMMANDS.FETCH_ROLES:
                    if (!finalUsername) return 'Error: Username required'
                    const user = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!user) return `Error: Could not find user "${finalUsername}"`

                    const guildMember = await guild.members.fetch(user.id)
                    const roles = guildMember?.roles.cache.map(r => r.name) || []
                    return JSON.stringify({ roles }, null, 2)

                case ASSISTANT_COMMANDS.FETCH_BOT_ROLES:
                    logger.info('[Command Parser] Fetching bot roles')
                    const botMember = await guild.members.fetchMe()
                    const permissions = new PermissionsBitField(botMember.permissions).toArray()
                    const result = JSON.stringify({
                        roles: botMember.roles.cache.map(r => r.name),
                        permissions
                    }, null, 2)
                    logger.info(`[Command Parser] Bot roles result: ${result}`)
                    return result

                case ASSISTANT_COMMANDS.FETCH_USER:
                    if (!finalUsername) return 'Error: Username required'
                    const targetUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!targetUser) return `Error: Could not find user "${finalUsername}"`

                    return JSON.stringify({
                        username: targetUser.username,
                        displayName: targetUser.displayName,
                        createdAt: targetUser.createdAt,
                        id: targetUser.id
                    }, null, 2)

                case ASSISTANT_COMMANDS.GET_RICH_PRESENCE:
                    if (!finalUsername) return 'Error: Username required'
                    const presenceUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
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

                case ASSISTANT_COMMANDS.GET_EMOJIS:
                    const emojis = Array.from(this.crimsonChat.client.emojis.cache.values())
                        .map(e => ({ name: e.name, id: e.id }))
                    return JSON.stringify({ emojis }, null, 2)

                case ASSISTANT_COMMANDS.CREATE_CHANNEL:
                    if (!params) return 'Error: Channel name required'
                    const channelName = params.trim()

                    return await moderationCommand(
                        new PermissionsBitField(PermissionsBitField.Flags.ManageChannels),
                        async () => {
                            await guild.channels.create({
                                name: channelName,
                                type: ChannelType.GuildText
                            })
                        },
                        `Successfully created text channel #${channelName}`
                    )

                case ASSISTANT_COMMANDS.IGNORE:
                    return null

                default:
                    logger.warn(`[Command Parser] Unknown command: ${command}`)
                    return `Error: Unknown command "${command}"`
            }
        } catch (error) {
            logger.error(`[Command Parser] Error processing command ${command}: ${error}`)
            return `Error processing command "${command}": ${error instanceof Error ? error.message : 'Unknown error'}`

        }
    }
}
