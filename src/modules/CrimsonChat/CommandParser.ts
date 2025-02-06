import { Message, PermissionsBitField, ChannelType } from 'discord.js'
import { Logger } from '../../util/logger'
import { ASSISTANT_COMMANDS, getAssistantCommandRegex } from '../../util/constants'
import CrimsonChat from '.'
import chalk from 'chalk'

const logger = new Logger('CrimsonChat | CommandParser')

export class CommandParser {
    private crimsonChat = CrimsonChat.getInstance()

    async parseCommand(text: string, originalMessage?: Message): Promise<string | null> {
        if (!this.crimsonChat.client) {
            logger.error('{parseCommand} Client not set')
            throw new Error('Client not set')
        }

        logger.info(`{parseCommand} Processing command text: ${chalk.yellow(text)}`)

        const commandRegex = getAssistantCommandRegex()
        const match = commandRegex.exec(text)

        if (!match) {
            logger.info('{parseCommand} No command pattern found')
            return null
        }

        const [_, command, params] = match
        logger.info(`{parseCommand} Matched command: ${chalk.yellow(command)}, params: ${chalk.yellow(params)}`)

        let finalUsername = params?.trim() || ''

        try {
            // Get guild from original message, fallback to first available guild
            const guild = originalMessage?.guild || this.crimsonChat.client.guilds.cache.first()
            if (!guild) {
                logger.error('{parseCommand} No guild available (no original message, original message guild or cached guilds)')
                return 'Error: No guild available'
            }

            logger.info(`{parseCommand} Processing command ${chalk.yellow(command)} with username: ${chalk.yellow(finalUsername)} in guild: ${chalk.yellow(guild.name)}`)

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
                    logger.info('{parseCommand} Fetching bot roles')
                    const botMember = await guild.members.fetchMe()
                    const permissions = new PermissionsBitField(botMember.permissions).toArray()
                    const result = JSON.stringify({
                        roles: botMember.roles.cache.map(r => r.name),
                        permissions
                    }, null, 2)
                    logger.info(`{parseCommand} Bot roles result: ${chalk.yellow(result)}`)
                    return result

                case ASSISTANT_COMMANDS.FETCH_USER:
                    if (!finalUsername) return 'Error: Username required'
                    const targetUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!targetUser) return `Error: Could not find user "${finalUsername}"`

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

                case ASSISTANT_COMMANDS.TIMEOUT_MEMBER:
                    if (!finalUsername) return 'Error: Username required'
                    const timeoutUser = this.crimsonChat.client.users.cache.find(u => u.username.toLowerCase() === finalUsername.toLowerCase())
                    if (!timeoutUser) return `Error: Could not find user "${finalUsername}"`

                    return await moderationCommand(
                        new PermissionsBitField(PermissionsBitField.Flags.ModerateMembers),
                        async () => {
                            const member = await guild.members.fetch(timeoutUser.id)
                            await member.timeout(60000, 'Timeout requested by Crimson 1')
                        },
                        `Successfully timed out user ${finalUsername}`
                    )

                default:
                    logger.warn(`{parseCommand} Unknown command: ${chalk.yellow(command)}`)
                    return `Error: Unknown command "${command}"`
            }
        } catch (e) {
            const error = e as Error
            logger.error(`{parseCommand} Error processing command ${chalk.yellow(command)}: ${chalk.red(error.message)}`)
            return `Error processing command "${command}": ${error instanceof Error ? error.message : error}`
        }
    }
}
