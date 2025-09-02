import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { formatBytes } from '../util/functions'

const usageTracker = new Map<string, number[]>()
const USAGE_LIMIT = 2
const WINDOW_MINUTES = 10

function canExecuteCommand(command: string): boolean {
    const now = Date.now()
    const timestamps = usageTracker.get(command) ?? []
    const windowMs = WINDOW_MINUTES * 60 * 1000
    const validTimestamps = timestamps.filter(t => now - t < windowMs)
    if (validTimestamps.length >= USAGE_LIMIT) return false
    usageTracker.set(command, validTimestamps)
    return true
}

function trackSuccessfulExecution(command: string): void {
    const timestamps = usageTracker.get(command) ?? []
    timestamps.push(Date.now())
    usageTracker.set(command, timestamps)
}

export default {
    data: new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Bot management and info commands')
        .addSubcommand(subcommand => subcommand
            .setName('info')
            .setDescription('Show bot statistics and information')
        ).addSubcommand(subcommand => subcommand
            .setName('set_global_avatar')
            .setDescription('Change the global bot avatar.')
            .addAttachmentOption(option => option
                .setName('avatar')
                .setDescription('New avatar')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('set_global_banner')
            .setDescription('Set the global bot banner.')
            .addAttachmentOption(option => option
                .setName('banner')
                .setDescription('New banner')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('set_global_username')
            .setDescription('Change the global bot username.')
            .addStringOption(option => option
                .setName('username')
                .setDescription('New username')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('shortcut')
                .setDescription('Shortcut to change username to either guild name, your username, or your guild username')
                .addChoices(
                    { name: 'Guild Name', value: 'guild' },
                    { name: 'Your Username', value: 'user' },
                    { name: 'Your Guild Username', value: 'guilduser' }
                ).setRequired(false)
            )
        ),
    async execute(ctx) {
        const subcommand = ctx.getSubcommand()
        if (subcommand === 'info') {
            await ctx.deferReply()
            const { heapUsed, heapTotal, rss } = process.memoryUsage()
            const uptime = Math.floor(process.uptime())
            const uptimeStr = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
            const application = await ctx.client.application!.fetch()

            const ongoingOperations = ctx.operationTracker.getPendingOperations().length

            await ctx.editReply({
                embeds: [{
                    title: '🤖 Bot Information',
                    fields: [
                        { name: 'Memory Usage', value: `Heap: ${formatBytes(heapUsed)}/${formatBytes(heapTotal)}
RSS: ${formatBytes(rss)}`, inline: true },
                        { name: 'Process Uptime', value: uptimeStr, inline: true },
                        { name: '~ Installation Stats', value: `Servers: ${application.approximateGuildCount ?? 'N/A'}
Users: ${application.approximateUserInstallCount ?? 'N/A'}`, inline: true },
                        { name: 'Ongoing Operations', value: `${ongoingOperations}`, inline: true }
                    ],
                    color: 0x2B2D31,
                    timestamp: new Date().toISOString()
                }]
            })
            return
        }

        // Lock out everyone but me from the rest of the subcommands
        try { await ctx.assertEmbi() } catch { return }

        if (subcommand === 'set_global_avatar') {
            await ctx.deferReply()
            const avatar = ctx.getAttachmentOption('avatar', true)
            await ctx.client.user.setAvatar(avatar.url)
            await ctx.editReply('✅ Avatar changed')
            return
        }
        if (subcommand === 'set_global_banner') {
            await ctx.deferReply()
            const banner = ctx.getAttachmentOption('banner', true)
            await ctx.client.user.setBanner(banner.url)
            await ctx.editReply('✅ Banner changed')
            return
        }
        if (subcommand === 'set_global_username') {
            if (!canExecuteCommand(subcommand)) {
                await ctx.reply(`❌ This command can only be ran ${USAGE_LIMIT} times every ${WINDOW_MINUTES} minutes, to avoid API rate limiting`)
                return
            }
            await ctx.deferReply()
            let username = ctx.getStringOption('username')
            const shortcut = ctx.getStringOption('shortcut')
            if (!username && !shortcut) {
                await ctx.editReply('❌ You must provide either a username or a shortcut')
                return
            }
            if (shortcut === 'guild') {
                if (!ctx.guild) {
                    await ctx.editReply('❌ The `guild` shortcut can only be used in a guild channel')
                    return
                }
                username = ctx.guild.name
            } else if (shortcut === 'user') {
                username = ctx.user.username
            } else if (shortcut === 'guilduser') {
                if (!ctx.guild) {
                    await ctx.editReply('❌ The `guilduser` shortcut can only be used in a guild channel')
                    return
                }
                username = ctx.member!.user.username ?? ctx.user.username
            }
            if (!username) {
                await ctx.editReply('❌ Unexpected error: Username could not be determined')
                return
            }
            try {
                await ctx.client.user.setUsername(username)
                trackSuccessfulExecution(subcommand)
            } catch (e) {
                if ((e as Error).message.includes('USERNAME_RATE_LIMIT')) {
                    await ctx.editReply('❌ Hit the username change rate limit')
                    return
                }
                await ctx.editReply(`❌ Error changing username: ${(e as Error).message}`)
                return
            }
            await ctx.editReply(`✅ Username changed to ${username}`)
            return
        }
    }
} satisfies SlashCommand
