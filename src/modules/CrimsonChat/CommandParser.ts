import { Message, PermissionsBitField, ChannelType } from 'discord.js'
import { Logger } from '../../util/logger'
import { ASSISTANT_COMMANDS } from '../../util/constants'
import CrimsonChat from '.'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | CommandParser')

export class CommandParser {
    private crimsonChat = CrimsonChat.getInstance()

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
                    return `Error: Missing required permission: ${permissionRequired.toString()}`
                }

                try {
                    await action()
                    return successMessage
                } catch (error) {
                    return `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
            }

            // Return results as strings only, never send messages directly
            switch (command.name) {
                case ASSISTANT_COMMANDS.FETCH_ROLES:
                    if (!finalUsername) return 'Error: Username required'
                    const user = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!user) return `Error: Could not find user "${finalUsername}"; make sure you are using \`username\` and not \`displayName\``

                    const guildMember = await guild.members.fetch(user.id)
                    const roles = guildMember?.roles.cache.map(r => r.name) || []
                    return JSON.stringify({
                        server: { name: guild.name, id: guild.id }, roles
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
                    const targetUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!targetUser) return `Error: Could not find user "${finalUsername}"; make sure you are using \`username\` and not \`displayName\``

                    const targetGuildMember = await guild.members.fetch(targetUser.id)
                    return JSON.stringify({
                        username: targetUser.username,
                        displayName: targetUser.displayName,
                        serverDisplayName: targetGuildMember?.displayName,
                        createdAt: targetUser.createdAt,
                        joinedAt: targetGuildMember?.joinedAt,
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
                        `Successfully created text channel #${channelName}`
                    )

                case ASSISTANT_COMMANDS.TIMEOUT_MEMBER:
                    if (!command.params?.[0]) return 'Error: Username required'
                    const timeoutUsername = command.params[0].toLowerCase()
                    const timeoutUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === timeoutUsername)
                    if (!timeoutUser) return `Error: Could not find user "${command.params[0]}"`

                    return await moderationCommand(
                        new PermissionsBitField(PermissionsBitField.Flags.ModerateMembers),
                        async () => {
                            const member = await guild.members.fetch(timeoutUser.id)
                            await member.timeout(60000, 'Timeout requested by Crimson 1')
                        },
                        `Successfully timed out user ${command.params[0]}`
                    )

                case ASSISTANT_COMMANDS.IGNORE:
                    // equivalent of `ADMIN_COMMANDS.BAN`, but for the bot (ban as in ignore, not a discord ban)
                    if (!command.params?.[0]) return 'Error: Username required'
                    const ignoreUsername = command.params[0]
                    const ignoreUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === ignoreUsername.toLowerCase())
                    if (!ignoreUser) return `Error: Could not find user "${ignoreUsername}"`
                    await this.crimsonChat.banUser(ignoreUser.id)
                    return `Now ignoring user ${ignoreUsername}`
                case ASSISTANT_COMMANDS.UNIGNORE:
                    // equivalent of `ADMIN_COMMANDS.UNBAN`, but for the bot (unban as in unignore, not a discord unban)
                    if (!command.params?.[0]) return 'Error: Username required'
                    const unignoreUsername = command.params[0]
                    const unignoreUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === unignoreUsername.toLowerCase())
                    if (!unignoreUser) return `Error: Could not find user "${unignoreUsername}"`
                    await this.crimsonChat.unbanUser(unignoreUser.id)
                    return `No longer ignoring user ${unignoreUsername}`

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
