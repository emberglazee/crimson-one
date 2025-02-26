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
            .setName('ignore')
            .setDescription('Make CrimsonChat ignore a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('The user to ignore')
                .setRequired(false)
            ).addStringOption(opt => opt
                .setName('userid')
                .setDescription('The user ID to ignore')
                .setRequired(false)
            )
        ).addSubcommand(sub => sub
            .setName('unignore')
            .setDescription('Stop CrimsonChat from ignoring a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('The user to stop ignoring')
                .setRequired(false)
            ).addStringOption(opt => opt
                .setName('userid')
                .setDescription('The user ID to unignore')
                .setRequired(false)
            )
        ).addSubcommand(sub => sub
            .setName('ignorelist')
            .setDescription('List all ignored users')
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

            case 'ignore': {
                const user = interaction.options.getUser('user')
                const userId = interaction.options.getString('userid')

                if (!user && !userId) {
                    await interaction.reply('❌ You must provide either a user or a user ID')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.ignoreUser(targetId!)
                await interaction.reply(`✅ ${username} is now ignored by CrimsonChat`)
                await crimsonChat.sendMessage(
                    `Now ignoring user ${username}, you are now unable to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }

            case 'unignore': {
                const user = interaction.options.getUser('user')
                const userId = interaction.options.getString('userid')

                if (!user && !userId) {
                    await interaction.reply('❌ You must provide either a user or a user ID')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.unignoreUser(targetId!)
                await interaction.reply(`✅ CrimsonChat will no longer ignore ${username}`)
                await crimsonChat.sendMessage(
                    `User ${username} has been unignored, you are now able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }

            case 'ignorelist':
                const ignoredUsers = crimsonChat.getIgnoredUsers()
                if (ignoredUsers.length === 0) {
                    await interaction.reply('✅ No users are ignored from CrimsonChat')
                    return
                }

                await interaction.deferReply()
                const ignoredUsernames = await Promise.all(ignoredUsers.map(async userId => {
                    try {
                        const user = await crimsonChat.client!.users.fetch(userId)
                        return user.username
                    } catch {
                        return userId
                    }
                }))
                await interaction.editReply(`✅ Users ignored by CrimsonChat: \`${ignoredUsernames.join(', ')}\``)
                break
        }
    }
} satisfies SlashCommand
