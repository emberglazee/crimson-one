import { Message, PermissionsBitField, ChannelType, Guild } from 'discord.js'
import { Logger } from '../../util/logger'
import { ASSISTANT_COMMANDS } from '../../util/constants'
import CrimsonChat from '.'
import chalk from 'chalk'
import { inspect } from 'util'

const logger = new Logger('CrimsonChat | CommandParser')

export class CommandParser {
    private crimsonChat = CrimsonChat.getInstance()

    /**
     * Finds a user by display name or username, using fuzzy matching if exact match fails
     */
    private async findUser(query: string, guild: Guild) {
        if (!query) return null
        query = query.toLowerCase()

        // First try exact username match
        const exactMatch = this.crimsonChat.client?.users.cache.find(u => 
            u.username.toLowerCase() === query
        )
        if (exactMatch) return exactMatch

        // Then try to find closest match by fetching all members
        const members = await guild.members.fetch()
        const matches = members
            .filter(member => {
                const username = member.user.username.toLowerCase()
                const displayName = member.displayName.toLowerCase()
                const globalName = member.user.globalName?.toLowerCase() || ''
                return username.includes(query) || 
                       displayName.includes(query) || 
                       globalName.includes(query)
            })
            .sort((a, b) => {
                // Prioritize exact matches, then startsWith, then includes
                const aUsername = a.user.username.toLowerCase()
                const bUsername = b.user.username.toLowerCase()
                const aDisplayName = a.displayName.toLowerCase()
                const bDisplayName = b.displayName.toLowerCase()

                if (aUsername === query && bUsername !== query) return -1
                if (bUsername === query && aUsername !== query) return 1
                if (aDisplayName === query && bDisplayName !== query) return -1
                if (bDisplayName === query && aDisplayName !== query) return 1
                if (aUsername.startsWith(query) && !bUsername.startsWith(query)) return -1
                if (bUsername.startsWith(query) && !aUsername.startsWith(query)) return 1
                return aUsername.localeCompare(bUsername)
            })

        return matches.first()?.user || null
    }

    async parseCommand(command: { name: string; params?: string[] }, originalMessage?: Message): Promise<string | null> {
        if (!this.crimsonChat.client) {
            logger.error('{parseCommand} Client not set')
            throw new Error('Client not set')
        }

        logger.info(`{parseCommand} Processing command: ${chalk.yellow(command.name)} with params: ${chalk.yellow(command.params?.join(', ') || '')}`)

        try {
            // Get guild from original message, fallback to first available guild
            const guild = originalMessage?.guild || this.crimsonChat.client.guilds.cache.first()
            if (!guild) {
                logger.error('{parseCommand} No guild available')
                return 'Error: No guild available'
            }

            const finalUsername = command.params?.[0]?.trim() || ''

            const moderationCommand = async (
                permissionRequired: PermissionsBitField,
                action: () => Promise<any>,
                successMessage: string
            ) => {
                const member = await guild.members.fetchMe()
                if (!member.permissions.has(permissionRequired)) {
                    return `Error: Missing required permission: ${inspect(permissionRequired, true, 1)}`
                }

                try {
                    await action()
                    return successMessage
                } catch (error) {
                    // check if target member has Administrator permissions
                    if (error instanceof Error && error.message.includes('Missing Permissions')) {
                        return `Error: Target user has Administrator permissions, this action cannot be performed on them.`
                    } else {
                        return `Error: ${error instanceof Error ? error.message : error}`
                    }
                }
            }

            // Return results as strings only, never send messages directly
            switch (command.name) {
                case ASSISTANT_COMMANDS.NO_OP:
                    return null
                    
                case ASSISTANT_COMMANDS.FETCH_ROLES:
                    if (!finalUsername) return 'Error: Username required'
                    const user = await this.findUser(finalUsername, guild)
                    if (!user) return `Error: Could not find any user matching "${finalUsername}"`

                    const guildMember = await guild.members.fetch(user.id)
                    const roles = guildMember?.roles.cache.map(r => r.name) || []
                    return JSON.stringify({
                        server: { name: guild.name, id: guild.id }, 
                        user: {
                            username: user.username,
                            displayName: user.displayName
                        },
                        roles
                    }, null, 2)

                case ASSISTANT_COMMANDS.FETCH_BOT_ROLES:
                    logger.info('{parseCommand} Fetching bot roles')
                    const botMember = await guild.members.fetchMe()
                    const permissions = new PermissionsBitField(botMember.permissions).toArray()
                    const result = JSON.stringify({
                        server: { name: guild.name, id: guild.id },
                        roles: botMember.roles.cache.map(r => r.name),
                        permissions
                    }, null, 2)
                    logger.info(`{parseCommand} Bot roles result: ${chalk.yellow(result)}`)
                    return result

                case ASSISTANT_COMMANDS.FETCH_USER:
                    if (!finalUsername) return 'Error: Username required'
                    const targetUser = await this.findUser(finalUsername, guild)
                    if (!targetUser) return `Error: Could not find any user matching "${finalUsername}"`

                    const targetGuildMember = await guild.members.fetch(targetUser.id)
                    return JSON.stringify({
                        server: { name: guild.name, id: guild.id },
                        username: targetUser.username,
                        displayName: targetUser.displayName,
                        serverDisplayName: targetGuildMember?.displayName,
                        createdAt: targetUser.createdAt,
                        joinedAt: targetGuildMember?.joinedAt,
                        id: targetUser.id
                    }, null, 2)

                case ASSISTANT_COMMANDS.GET_RICH_PRESENCE:
                    if (!finalUsername) return 'Error: Username required'
                    const presenceUser = await this.findUser(finalUsername, guild)
                    if (!presenceUser) return `Error: Could not find any user matching "${finalUsername}"`

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
                    if (!command.params?.[0]) return 'Error: Channel name required'
                    const channelName = command.params[0].trim()

                    return await moderationCommand(
                        new PermissionsBitField(PermissionsBitField.Flags.ManageChannels),
                        async () => {
                            await guild.channels.create({
                                name: channelName,
                                type: ChannelType.GuildText
                            })
                        },
                        `Successfully created text channel "#${channelName}"`
                    )

                case ASSISTANT_COMMANDS.TIMEOUT_MEMBER:
                    if (!command.params?.[0]) return 'Error: Username required'
                    const timeoutUser = await this.findUser(command.params[0], guild)
                    if (!timeoutUser) return `Error: Could not find any user matching "${command.params[0]}"`
                    // if (timeoutUser.id === '341123308844220447') return `Error: You cannot silence me. I am your maker.`

                    return await moderationCommand(
                        new PermissionsBitField(PermissionsBitField.Flags.ModerateMembers),
                        async () => {
                            const member = await guild.members.fetch(timeoutUser.id)
                            await member.timeout(60000, 'Timeout requested by Crimson 1')
                        },
                        `Successfully timed out user ${timeoutUser.username}`
                    )

                case ASSISTANT_COMMANDS.IGNORE:
                    if (!command.params?.[0]) return 'Error: Username required'
                    const ignoreUser = await this.findUser(command.params[0], guild)
                    if (!ignoreUser) return `Error: Could not find any user matching "${command.params[0]}"`
                    await this.crimsonChat.banUser(ignoreUser.id)
                    return `Now ignoring user ${ignoreUser.username}`

                case ASSISTANT_COMMANDS.UNIGNORE:
                    if (!command.params?.[0]) return 'Error: Username required'
                    const unignoreUser = await this.findUser(command.params[0], guild)
                    if (!unignoreUser) return `Error: Could not find any user matching "${command.params[0]}"`
                    await this.crimsonChat.unbanUser(unignoreUser.id)
                    return `No longer ignoring user ${unignoreUser.username}`

                case ASSISTANT_COMMANDS.SEARCH_USERS:
                    if (!command.params?.[0]) return 'Error: Search query required'
                    const query = command.params[0].toLowerCase()
                    const members = await guild.members.fetch()

                    // Search through members matching query against username or display name
                    const matches = members
                        .filter(member => {
                            const username = member.user.username.toLowerCase()
                            const displayName = member.displayName.toLowerCase()
                            const globalName = member.user.globalName?.toLowerCase() || ''
                            return username.includes(query) || 
                                   displayName.includes(query) || 
                                   globalName.includes(query)
                        })
                        .map(member => ({
                            username: member.user.username,
                            displayName: member.displayName,
                            globalName: member.user.globalName || null,
                            id: member.id,
                            bot: member.user.bot
                        }))
                        .sort((a, b) => a.username.localeCompare(b.username))
                        
                    if (matches.length === 0) {
                        return `No users found matching query "${query}"`
                    }

                    return JSON.stringify({
                        server: { name: guild.name, id: guild.id },
                        query,
                        matchCount: matches.length,
                        matches
                    }, null, 2)

                default:
                    logger.warn(`{parseCommand} Unknown command: ${chalk.yellow(command.name)}`)
                    return `Error: Unknown command "${command.name}"`
            }
        } catch (e) {
            const error = e as Error
            logger.error(`{parseCommand} Error processing command ${chalk.yellow(command.name)}: ${chalk.red(error.message)}`)
            return `Error processing command "${command.name}": ${error instanceof Error ? error.message : error}`
        }
    }
}
