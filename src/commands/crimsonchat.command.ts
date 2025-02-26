import { SlashCommand } from '../modules/CommandManager'
import { SlashCommandBuilder } from 'discord.js'
import { EMBERGLAZE_ID } from '../util/constants'
import CrimsonChat from '../modules/CrimsonChat'

export default {
    data: new SlashCommandBuilder()
        .setName('crimsonchat')
        .setDescription('Admin commands to control CrimsonChat (reserved to emberglaze)')
        .addSubcommand(sub => sub
            .setName('reset')
            .setDescription('Reset chat history')
        ).addSubcommand(sub => sub
            .setName('resetmem')
            .setDescription('Reset long-term memories')
        ).addSubcommand(sub => sub
            .setName('updateprompt')
            .setDescription('Update the system prompt to latest version')
        ).addSubcommand(sub => sub
            .setName('toggle')
            .setDescription('Toggle CrimsonChat on/off')
        ).addSubcommand(sub => sub
            .setName('forcebreak')
            .setDescription('Force a mental breakdown on next message')
        ).addSubcommand(sub => sub
            .setName('smack')
            .setDescription('Remind Crimson of its system prompt')
        ).addSubcommand(sub => sub
            .setName('ban')
            .setDescription('Ban a user from using CrimsonChat')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('The user to ban')
                .setRequired(false)
            ).addStringOption(opt => opt
                .setName('userid')
                .setDescription('The user ID to ban')
                .setRequired(false)
            )
        ).addSubcommand(sub => sub
            .setName('unban')
            .setDescription('Unban a user from CrimsonChat')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('The user to unban')
                .setRequired(false)
            ).addStringOption(opt => opt
                .setName('userid')
                .setDescription('The user ID to unban')
                .setRequired(false)
            )
        ).addSubcommand(sub => sub
            .setName('banlist')
            .setDescription('List all banned users')
        ),

    async execute(interaction) {
        if (interaction.user.id !== EMBERGLAZE_ID) {
            await interaction.reply('❌ You, solely, are responsible for this')
            return
        }

        const crimsonChat = CrimsonChat.getInstance()
        const subcommand = interaction.options.getSubcommand()

        switch (subcommand) {
            case 'reset':
                await crimsonChat.clearHistory()
                await interaction.reply('✅ Chat history reset')
                break

            case 'resetmem':
                await crimsonChat.clearMemories()
                await interaction.reply('✅ Long-term memories reset')
                break

            case 'updateprompt':
                await crimsonChat.updateSystemPrompt()
                await interaction.reply('✅ System prompt updated')
                await crimsonChat.sendMessage(
                    'System prompt has been updated to latest version.',
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break

            case 'toggle':
                crimsonChat.setEnabled(!crimsonChat.isEnabled())
                await interaction.reply(crimsonChat.isEnabled() ? '✅ CrimsonChat enabled' : '🔴 CrimsonChat disabled')
                await crimsonChat.sendMessage(
                    `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break

            case 'forcebreak':
                crimsonChat.setForceNextBreakdown(true)
                await interaction.reply('✅ Mental breakdown will be triggered on next message')
                break

            case 'smack':
                await interaction.reply('⏱️ Sending system prompt reminder...')
                await crimsonChat.sendMessage(
                    `You've been smacked by ${interaction.user.username}. This means that you're out of line with the system prompt. Here's a friendly reminder for you.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                await interaction.followUp('✅ System prompt reminder sent')
                break

            case 'ban': {
                const user = interaction.options.getUser('user')
                const userId = interaction.options.getString('userid')

                if (!user && !userId) {
                    await interaction.reply('❌ You must provide either a user or a user ID')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.banUser(targetId!)
                await interaction.reply(`✅ Banned ${username} from CrimsonChat`)
                await crimsonChat.sendMessage(
                    `User ${username} has been banned, you are now not able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }

            case 'unban': {
                const user = interaction.options.getUser('user')
                const userId = interaction.options.getString('userid')

                if (!user && !userId) {
                    await interaction.reply('❌ You must provide either a user or a user ID')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.unbanUser(targetId!)
                await interaction.reply(`✅ Unbanned ${username} from CrimsonChat`)
                await crimsonChat.sendMessage(
                    `User ${username} has been unbanned, you are now able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }

            case 'banlist':
                const bannedUsers = crimsonChat.getBannedUsers()
                if (bannedUsers.length === 0) {
                    await interaction.reply('✅ No users are banned from CrimsonChat')
                    return
                }
                
                await interaction.deferReply()
                const bannedUsernames = await Promise.all(bannedUsers.map(async userId => {
                    try {
                        const user = await crimsonChat.client!.users.fetch(userId)
                        return user.username
                    } catch {
                        return userId
                    }
                }))
                await interaction.editReply(`✅ Banned users: ${bannedUsernames.join(', ')}`)
                break
        }
    }
} satisfies SlashCommand
