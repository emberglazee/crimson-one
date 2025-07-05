import { SlashCommand } from '../types'
import { SlashCommandBuilder } from 'discord.js'
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
            .setName('testmode')
            .setDescription('Toggle compliant test mode (bypasses personality for easier testing)')
            .addBooleanOption(opt => opt
                .setName('enabled')
                .setDescription('Enable or disable test mode')
                .setRequired(true)
            )
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
                    { name: 'Gemini 2.5 Pro',                value: 'gemini-2.5-pro' },
                    { name: 'Gemini 2.5 Flash',              value: 'gemini-2.5-flash' },
                    { name: 'Gemini 2.5 Flash Lite Preview', value: 'gemini-2.5-flash-lite-preview-06-17' },
                    { name: 'Gemini 2.0 Flash (Default)',    value: 'gemini-2.0-flash' },
                    { name: 'Gemini 2.0 Flash Lite',         value: 'gemini-2.0-flash-lite' },
                    { name: 'Gemma 3n E4B IT',               value: 'gemma-3n-e4b-it' },
                    { name: 'Gemma 3 27B IT',                value: 'gemma-3-27b-it' }
                )
            )
        ),

    async execute(context) {
        const isRoleAllowed = context.member?.roles.cache.has('958529446560808961') ?? false
        if (!context.isEmbi && !isRoleAllowed) {
            await context.reply('❌ You, solely, are responsible for this.')
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
                crimsonChat.sendMessage(
                    'System prompt has been updated to latest version.',
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: 'System prompt has been updated to latest version.' }
                )
                break

            case 'toggle':
                crimsonChat.setEnabled(!crimsonChat.isEnabled())
                await context.reply(crimsonChat.isEnabled() ? '✅ CrimsonChat enabled' : '🔴 CrimsonChat disabled')
                crimsonChat.sendMessage(
                    `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}` }
                )
                break

            case 'forcebreak':
                if (crimsonChat.isTestMode()) {
                    await context.reply('❌ Breakdowns are disabled while in test mode.')
                    return
                }
                crimsonChat.setForceNextBreakdown(true)
                await context.reply('✅ Mental breakdown will be triggered on next message')
                break

            case 'smack':
                await context.reply('⏱️ Sending system prompt reminder...')
                crimsonChat.sendMessage(
                    `You've been smacked by ${context.user.username}. This means that you're out of line with the system prompt. Here's a friendly reminder for you.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `You've been smacked by ${context.user.username}. This means that you're out of line with the system prompt. Here's a friendly reminder for you.` }
                )
                await context.followUp('✅ System prompt reminder sent')
                break

            case 'berserk': {
                if (crimsonChat.isTestMode()) {
                    await context.reply('❌ Berserk mode is disabled while in test mode.')
                    return
                }
                const isEnabled = await crimsonChat.toggleBerserkMode()
                const status = isEnabled ? 'ENABLED' : 'DISABLED'
                await context.reply(`🚨 Berserk mode is now **${status}**. Maximum chaos protocol ${isEnabled ? 'engaged' : 'disengaged'}.`)
                crimsonChat.sendMessage(
                    `System Alert: Berserk mode has been ${status.toLowerCase()} by ${context.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `System Alert: Berserk mode has been ${status.toLowerCase()} by ${context.user.username}.` }
                )
                break
            }

            case 'testmode': {
                const enabled = context.getBooleanOption('enabled', true)
                await crimsonChat.setTestMode(enabled)
                const status = enabled ? 'ENABLED' : 'DISABLED'
                await context.reply(`✅ Compliant test mode is now **${status}**.`)
                crimsonChat.sendMessage(
                    `System Alert: Compliant test mode has been ${status.toLowerCase()} by ${context.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `System Alert: Compliant test mode has been ${status.toLowerCase()} by ${context.user.username}.` }
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
                crimsonChat.sendMessage(
                    `Now ignoring user ${username}, you are now unable to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `Now ignoring user ${username}, you are now unable to see their messages.` }
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
                crimsonChat.sendMessage(
                    `User ${username} has been unignored, you are now able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `User ${username} has been unignored, you are now able to see their messages.` }
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
                crimsonChat.sendMessage(
                    `System Alert: Model has been switched to \`${model}\` by ${context.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `System Alert: Model has been switched to \`${model}\` by ${context.user.username}.` }
                )
                break
            }
        }
    }
} satisfies SlashCommand
