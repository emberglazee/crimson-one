import { SlashCommand } from '../modules/CommandManager'
import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import { EMBERGLAZE_ID } from '../util/constants'
import CrimsonChat from '../modules/CrimsonChat'

export default {
    data: new SlashCommandBuilder()
        .setName('crimsonchat')
        .setDescription('Admin commands to control CrimsonChat (reserved to emberglaze)')
        .addSubcommand(sub => sub
            .setName('message')
            .setDescription('Send a message to Crimson 1')
            .addStringOption(opt => opt
                .setName('content')
                .setDescription('The message to send')
                .setRequired(true))
            .addBooleanOption(opt => opt
                .setName('ephemeral')
                .setDescription('Should the response only show up for you?')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('reset')
            .setDescription('Reset chat history'))
        .addSubcommand(sub => sub
            .setName('resetmem')
            .setDescription('Reset long-term memories'))
        .addSubcommand(sub => sub
            .setName('updateprompt')
            .setDescription('Update the system prompt to latest version'))
        .addSubcommand(sub => sub
            .setName('toggle')
            .setDescription('Toggle CrimsonChat on/off'))
        .addSubcommand(sub => sub
            .setName('forcebreak')
            .setDescription('Force a mental breakdown on next message'))
        .addSubcommand(sub => sub
            .setName('smack')
            .setDescription('Remind Crimson of its system prompt'))
        .addSubcommand(sub => sub
            .setName('ban')
            .setDescription('Ban a user from using CrimsonChat')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('The user to ban')
                .setRequired(false))
            .addStringOption(opt => opt
                .setName('userid')
                .setDescription('The user ID to ban')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('unban')
            .setDescription('Unban a user from CrimsonChat')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('The user to unban')
                .setRequired(false))
            .addStringOption(opt => opt
                .setName('userid')
                .setDescription('The user ID to unban')
                .setRequired(false))),

    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        if (interaction.user.id !== EMBERGLAZE_ID) {
            await interaction.reply({
                content: '❌ You, solely, are responsible for this',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        const crimsonChat = CrimsonChat.getInstance()
        const subcommand = interaction.options.getSubcommand()

        switch (subcommand) {
            case 'message': {
                const content = interaction.options.getString('content', true)
                await interaction.reply({
                    content: `You sent the message: ${content}`,
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                break
            }

            case 'reset':
                await crimsonChat.clearHistory()
                await interaction.reply({
                    content: '✅ Chat history reset',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                break

            case 'resetmem':
                await crimsonChat.clearMemories()
                await interaction.reply({
                    content: '✅ Long-term memories reset',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                break

            case 'updateprompt':
                await crimsonChat.updateSystemPrompt()
                await interaction.reply({
                    content: '✅ System prompt updated',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                await crimsonChat.sendMessage(
                    'System prompt has been updated to latest version.',
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break

            case 'toggle':
                crimsonChat.setEnabled(!crimsonChat.isEnabled())
                await interaction.reply({
                    content: crimsonChat.isEnabled() ? '✅ CrimsonChat enabled' : '🔴 CrimsonChat disabled',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                await crimsonChat.sendMessage(
                    `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break

            case 'forcebreak':
                crimsonChat.setForceNextBreakdown(true)
                await interaction.reply({
                    content: '✅ Mental breakdown will be triggered on next message',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                break

            case 'smack':
                await interaction.reply({
                    content: '⏱️ Sending system prompt reminder...',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                await crimsonChat.sendMessage(
                    `You've been smacked by ${interaction.user.username}. This means that you're out of line with the system prompt. Here's a friendly reminder for you.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                await interaction.followUp({
                    content: '✅ System prompt reminder sent',
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                break

            case 'ban': {
                const user = interaction.options.getUser('user')
                const userId = interaction.options.getString('userid')
                
                if (!user && !userId) {
                    await interaction.reply({
                        content: '❌ You must provide either a user or a user ID',
                        flags: ephemeral ? MessageFlags.Ephemeral : undefined
                    })
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.banUser(targetId!)
                await interaction.reply({
                    content: `✅ Banned ${username} from CrimsonChat`,
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
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
                    await interaction.reply({
                        content: '❌ You must provide either a user or a user ID',
                        flags: ephemeral ? MessageFlags.Ephemeral : undefined
                    })
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.unbanUser(targetId!)
                await interaction.reply({
                    content: `✅ Unbanned ${username} from CrimsonChat`,
                    flags: ephemeral ? MessageFlags.Ephemeral : undefined
                })
                await crimsonChat.sendMessage(
                    `User ${username} has been unbanned, you are now able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }
        }
    }
} satisfies SlashCommand
