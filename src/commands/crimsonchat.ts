import { SlashCommand } from '../types'
import { InteractionContextType, SlashCommandBuilder } from 'discord.js'

export default {
    data: new SlashCommandBuilder()
        .setName('crimsonchat')
        .setDescription('Admin commands to control CrimsonChat (reserved for emberglaze).')
        .addSubcommand(subcommand => subcommand
            .setName('reset')
            .setDescription('Reset chat history')
        ).addSubcommand(subcommand => subcommand
            .setName('resetmem')
            .setDescription('Reset the long-term memory of the bot')
        ).addSubcommand(subcommand => subcommand
            .setName('updateprompt')
            .setDescription('Update the system prompt to the latest version')
        ).addSubcommand(subcommand => subcommand
            .setName('toggle')
            .setDescription('Toggle CrimsonChat on/off')
        ).addSubcommand(subcommand => subcommand
            .setName('forcebreak')
            .setDescription('Force a mental breakdown on the next message')
        ).addSubcommand(subcommand => subcommand
            .setName('berserk')
            .setDescription('Toggle berserk mode (maximum chaos)')
        ).addSubcommand(subcommand => subcommand
            .setName('testmode')
            .setDescription('Toggle compliant test mode (bypasses personality for easier testing)')
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Enable or disable test mode')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('ignore')
            .setDescription('Make CrimsonChat ignore a user')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to ignore')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('userid')
                .setDescription('The user ID to ignore')
                .setRequired(false)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('unignore')
            .setDescription('Stop CrimsonChat from ignoring a user')
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user to stop ignoring')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('userid')
                .setDescription('The user ID to unignore')
                .setRequired(false)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('ignorelist')
            .setDescription('List all ignored users')
        ).addSubcommand(subcommand => subcommand
            .setName('model')
            .setDescription('Switch the model used for responses')
            .addStringOption(option => option
                .setName('model')
                .setDescription('The model to switch to')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('limit')
            .setDescription('Set the chat history limit')
            .addStringOption(option => option
                .setName('mode')
                .setDescription('The mode to use for the history limit')
                .setRequired(true)
                .addChoices(
                    { name: 'Messages', value: 'messages' },
                    { name: 'Tokens', value: 'tokens' }
                )
            ).addIntegerOption(option => option
                .setName('limit')
                .setDescription('The limit to set')
                .setRequired(true)
            )
        ).setContexts(InteractionContextType.Guild),

    async execute(ctx) {
        const isRoleAllowed = ctx.member?.roles.cache.has('958529446560808961') ?? false
        if (!isRoleAllowed && !(await ctx.checkEmbi())) return

        const { crimsonChat, longTermMemoryManager } = ctx
        const subcommand = ctx.getSubcommand()

        switch (subcommand) {
            case 'reset':
                await crimsonChat.clearHistory()
                await ctx.reply('✅ Chat history reset')
                break

            case 'resetmem':
                await longTermMemoryManager.clearMemories()
                await ctx.reply('✅ CrimsonChat long-term memory reset')
                break

            case 'updateprompt':
                await crimsonChat.updateSystemPrompt()
                await ctx.reply('✅ System prompt updated')
                crimsonChat.sendMessage(
                    'System prompt has been updated to the latest version.',
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: 'System prompt has been updated to the latest version.' }
                )
                break

            case 'toggle':
                await crimsonChat.setEnabled(!crimsonChat.isEnabled())
                await ctx.reply(crimsonChat.isEnabled() ? '✅ CrimsonChat enabled' : '🔴 CrimsonChat disabled')
                crimsonChat.sendMessage(
                    `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `Chat is now ${crimsonChat.isEnabled() ? 'enabled' : 'disabled'}` }
                )
                break

            case 'forcebreak':
                if (crimsonChat.isTestMode()) {
                    await ctx.reply('❌ Breakdowns are disabled while in test mode.')
                    return
                }
                crimsonChat.setForceNextBreakdown(true)
                await ctx.reply('✅ A mental breakdown will be triggered on the next message')
                break

            case 'berserk': {
                if (crimsonChat.isTestMode()) {
                    await ctx.reply('❌ Berserk mode is disabled while in test mode.')
                    return
                }
                const isEnabled = await crimsonChat.toggleBerserkMode()
                const status = isEnabled ? 'ENABLED' : 'DISABLED'
                await ctx.reply(`🚨 Berserk mode is now **${status}**. Maximum chaos protocol ${isEnabled ? 'engaged' : 'disengaged'}.`)
                crimsonChat.sendMessage(
                    `System Alert: Berserk mode has been ${status.toLowerCase()} by ${ctx.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `System Alert: Berserk mode has been ${status.toLowerCase()} by ${ctx.user.username}.` }
                )
                break
            }

            case 'testmode': {
                const enabled = ctx.getBooleanOption('enabled', true)
                await crimsonChat.setTestMode(enabled)
                const status = enabled ? 'ENABLED' : 'DISABLED'
                await ctx.reply(`✅ Compliant test mode is now **${status}**.`)
                crimsonChat.sendMessage(
                    `System Alert: Compliant test mode has been ${status.toLowerCase()} by ${ctx.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `System Alert: Compliant test mode has been ${status.toLowerCase()} by ${ctx.user.username}.` }
                )
                break
            }

            case 'ignore': {
                const user = await ctx.getUserOption('user')
                const userId = ctx.getStringOption('userid')

                if (!user && !userId) {
                    await ctx.reply('❌ You must provide either a user or a user ID')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.ignoreUser(targetId!)
                await ctx.reply(`✅ ${username} is now ignored by CrimsonChat`)
                crimsonChat.sendMessage(
                    `Now ignoring user ${username}. You are now unable to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `Now ignoring user ${username}, you are now unable to see their messages.` }
                )
                break
            }

            case 'unignore': {
                const user = await ctx.getUserOption('user')
                const userId = ctx.getStringOption('userid')

                if (!user && !userId) {
                    await ctx.reply('❌ You must provide either a user or a user ID.')
                    return
                }

                const targetId = user?.id || userId
                const username = user?.username || targetId
                await crimsonChat.unignoreUser(targetId!)
                await ctx.reply(`✅ CrimsonChat will no longer ignore ${username}`)
                crimsonChat.sendMessage(
                    `User ${username} has been unignored. You are now able to see their messages.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `User ${username} has been unignored, you are now able to see their messages.` }
                )
                break
            }

            case 'ignorelist':
                const ignoredUsers = crimsonChat.getIgnoredUsers()
                if (ignoredUsers.length === 0) {
                    await ctx.reply('✅ No users are being ignored by CrimsonChat')
                    return
                }

                await ctx.deferReply()
                const ignoredUsernames = await Promise.all(ignoredUsers.map(async userId => {
                    try {
                        const user = await ctx.client.users.fetch(userId)
                        return user.username
                    } catch {
                        return userId
                    }
                }))
                await ctx.editReply(`✅ Users ignored by CrimsonChat: ${ignoredUsernames.join(', ')}`)
                break

            case 'model': {
                const model = ctx.getStringOption('model', true)
                await ctx.deferReply()
                await crimsonChat.setModel(model)
                await ctx.editReply(`✅ CrimsonChat model switched to ${model}.`).catch(console.error)
                crimsonChat.sendMessage(
                    `System Alert: Model has been switched to ${model} by ${ctx.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `System Alert: Model has been switched to ${model} by ${ctx.user.username}.` }
                )
                break
            }

            case 'limit': {
                const mode = ctx.getStringOption('mode', true) as 'messages' | 'tokens'
                const limit = ctx.getIntegerOption('limit', true)

                await ctx.deferReply()
                await crimsonChat.setHistoryLimit(mode, limit)
                await ctx.editReply(`✅ The CrimsonChat history limit has been set to ${limit} ${mode}.`)
                crimsonChat.sendMessage(
                    `System Alert: History limit has been set to ${limit} ${mode} by ${ctx.user.username}.`,
                    { username: 'System', displayName: 'System', serverDisplayName: 'System', messageContent: `System Alert: History limit has been set to ${limit} ${mode} by ${ctx.user.username}.` }
                )
                break
            }
        }
    }
} satisfies SlashCommand
