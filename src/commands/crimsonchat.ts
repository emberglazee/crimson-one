// commands\crimsonchat.ts
import { SlashCommand } from '../types/types'
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
            .setName('berserk')
            .setDescription('Toggle berserk mode (maximum chaos)')
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
        ).addSubcommand(sub => sub
            .setName('model')
            .setDescription('Switch the Gemini model used for responses')
            .addStringOption(opt => opt
                .setName('model')
                .setDescription('The model to switch to')
                .setRequired(true)
                .addChoices(
                    { name: 'Gemini Pro 2.5 Preview 06-05', value: 'gemini-2.5-pro-preview-06-05' },
                    { name: 'Gemini Pro 2.5 Preview 05-06', value: 'gemini-2.5-pro-preview-05-06' },
                    { name: 'Gemini Flash 2.5 Preview 05-20 (Default)', value: 'gemini-2.5-flash-preview-05-20' },
                    { name: 'Gemini Flash 2.5 Preview 04-17', value: 'gemini-2.5-flash-preview-04-17' },
                    { name: 'Gemini Flash 2.0', value: 'gemini-2.0-flash' },
                    { name: 'Gemini Flash 2.0 Lite', value: 'gemini-2.0-flash-lite' },
                    { name: 'Gemma 3n E4B IT', value: 'gemma-3n-e4b-it' },
                    { name: 'Gemma 3 27B IT', value: 'gemma-3-27b-it' }
                )
            )
        ),

    async execute(context) {
        if (context.user.id !== EMBERGLAZE_ID) {
            await context.reply('❌ You, solely, are responsible for this')
            return
        }

        const crimsonChat = CrimsonChat.getInstance()
        const subcommand = context.getSubcommand()

        switch (subcommand) {
            case 'reset':
                await crimsonChat.clearHistory()
                await context.reply('✅ Chat history reset')
                break

            case 'updateprompt':
                await crimsonChat.updateSystemPrompt()
                await context.reply('✅ System prompt updated')
                await crimsonChat.sendMessage(
                    'System prompt has been updated to latest version.',
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break

            case 'toggle':
                crimsonChat.setEnabled(!crimsonChat.isEnabled())
                await context.reply(crimsonChat.isEnabled() ? '✅ CrimsonChat enabled' : '🔴 CrimsonChat disabled')
                await crimsonChat.sendMessage(
                    `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break

            case 'forcebreak':
                crimsonChat.setForceNextBreakdown(true)
                await context.reply('✅ Mental breakdown will be triggered on next message')
                break

            case 'smack':
                await context.reply('⏱️ Sending system prompt reminder...')
                await crimsonChat.sendMessage(
                    `You've been smacked by ${context.user.username}. This means that you're out of line with the system prompt. Here's a friendly reminder for you.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                await context.followUp('✅ System prompt reminder sent')
                break

            case 'berserk': {
                const isEnabled = await crimsonChat.toggleBerserkMode()
                const status = isEnabled ? 'ENABLED' : 'DISABLED'
                await context.reply(`🚨 Berserk mode is now **${status}**. Maximum chaos protocol ${isEnabled ? 'engaged' : 'disengaged'}.`)
                await crimsonChat.sendMessage(
                    `System Alert: Berserk mode has been ${status.toLowerCase()} by ${context.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }

            case 'ignore': {
                const user = await context.getUserOption('user')
                const userId = context.getStringOption('userid')

                if (!user && !userId) {
                    await context.reply('❌ You must provide either a user or a user ID')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.ignoreUser(targetId!)
                await context.reply(`✅ ${username} is now ignored by CrimsonChat`)
                await crimsonChat.sendMessage(
                    `Now ignoring user ${username}, you are now unable to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }

            case 'unignore': {
                const user = await context.getUserOption('user')
                const userId = context.getStringOption('userid')

                if (!user && !userId) {
                    await context.reply('❌ You must provide either a user or a user ID')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.unignoreUser(targetId!)
                await context.reply(`✅ CrimsonChat will no longer ignore ${username}`)
                await crimsonChat.sendMessage(
                    `User ${username} has been unignored, you are now able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }

            case 'ignorelist':
                const ignoredUsers = crimsonChat.getIgnoredUsers()
                if (ignoredUsers.length === 0) {
                    await context.reply('✅ No users are ignored from CrimsonChat')
                    return
                }

                await context.deferReply()
                const ignoredUsernames = await Promise.all(ignoredUsers.map(async userId => {
                    try {
                        const user = await crimsonChat.client!.users.fetch(userId)
                        return user.username
                    } catch {
                        return userId
                    }
                }))
                await context.editReply(`✅ Users ignored by CrimsonChat: \`${ignoredUsernames.join(', ')}\``)
                break

            case 'model': {
                const model = context.getStringOption('model', true)
                await context.deferReply()
                await crimsonChat.setModel(model)
                await context.editReply(`✅ CrimsonChat model switched to \`${model}\`. The chat chain has been re-initialized.`)
                await crimsonChat.sendMessage(
                    `System Alert: Model has been switched to \`${model}\` by ${context.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System' }
                )
                break
            }
        }
    }
} satisfies SlashCommand
