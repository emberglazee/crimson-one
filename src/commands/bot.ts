import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import { formatBytes } from '../util/functions'

const usageTracker = new Map<string, number[]>()
const USAGE_LIMIT = 2
const WINDOW_MINUTES = 10

function canExecuteCommand(): boolean {
    const now = Date.now()
    const key = 'setusername'
    const timestamps = usageTracker.get(key) ?? []
    const windowMs = WINDOW_MINUTES * 60 * 1000
    const validTimestamps = timestamps.filter(t => now - t < windowMs)
    if (validTimestamps.length >= USAGE_LIMIT) return false
    usageTracker.set(key, validTimestamps)
    return true
}

function trackSuccessfulExecution() {
    const key = 'setusername'
    const timestamps = usageTracker.get(key) ?? []
    timestamps.push(Date.now())
    usageTracker.set(key, timestamps)
}

export default {
    data: new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Bot management and info commands')
        .addSubcommand(sc => sc
            .setName('info')
            .setDescription('Show bot statistics and information')
        ).addSubcommand(sc =>
            sc.setName('set_avatar')
                .setDescription('Change bot avatar')
                .addAttachmentOption(ao => ao
                    .setName('avatar')
                    .setDescription('New avatar')
                    .setRequired(true)
                )
        ).addSubcommand(sc => sc
            .setName('set_banner')
            .setDescription('Set bot banner')
            .addAttachmentOption(ao => ao
                .setName('banner')
                .setDescription('New banner')
                .setRequired(true)
            )
        ).addSubcommand(sc => sc
            .setName('set_username')
            .setDescription('Change bot username')
            .addStringOption(so => so
                .setName('username')
                .setDescription('New username')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('shortcut')
                .setDescription('Shortcut to change username to either guild name, your username, or your guild username')
                .addChoices(
                    { name: 'Guild Name', value: 'guild' },
                    { name: 'Your Username', value: 'user' },
                    { name: 'Your Guild Username', value: 'guilduser' }
                ).setRequired(false)
            )
        ),
    async execute(context) {
        const { reply, deferReply, editReply, client, myId, guild } = context
        const subcommand = context.getSubcommand()
        if (subcommand === 'info') {
            await deferReply()
            const { heapUsed, heapTotal, rss } = process.memoryUsage()
            const uptime = Math.floor(process.uptime())
            const uptimeStr = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
            const application = await client.application!.fetch()
            await editReply({
                embeds: [{
                    title: '🤖 Bot Information',
                    fields: [
                        { name: 'Memory Usage', value: `Heap: ${formatBytes(heapUsed)}/${formatBytes(heapTotal)}\nRSS: ${formatBytes(rss)}`, inline: true },
                        { name: 'Uptime', value: uptimeStr, inline: true },
                        { name: 'Stats (approx.)', value: `Servers: ${application.approximateGuildCount ?? 'N/A'}\nUsers: ${application.approximateUserInstallCount ?? 'N/A'}`, inline: true },
                    ],
                    color: 0x2B2D31,
                    timestamp: new Date().toISOString()
                }]
            })
            return
        }
        // Restrict the following subcommands to the owner
        if (context.user.id !== myId) {
            await reply('❌ You, solely, are responsible for this.')
            return
        }
        if (subcommand === 'set_avatar') {
            await deferReply()
            const avatar = await context.getAttachmentOption('avatar', true)
            await client.user!.setAvatar(avatar.url)
            await editReply('✅ Avatar changed')
            return
        }
        if (subcommand === 'set_banner') {
            await deferReply()
            const banner = await context.getAttachmentOption('banner', true)
            await client.user!.setBanner(banner.url)
            await editReply('✅ Banner changed')
            return
        }
        if (subcommand === 'set_username') {
            if (!canExecuteCommand()) {
                await reply(`❌ This command can only be ran ${USAGE_LIMIT} times every ${WINDOW_MINUTES} minutes, to avoid API rate limiting`)
                return
            }
            await deferReply()
            let username = await context.getStringOption('username')
            const shortcut = await context.getStringOption('shortcut')
            if (!username && !shortcut) {
                await editReply('❌ You must provide either a username or a shortcut')
                return
            }
            if (shortcut === 'guild') {
                if (!guild) {
                    await editReply('❌ The `guild` shortcut can only be used in a guild channel')
                    return
                }
                username = guild.name
            } else if (shortcut === 'user') {
                username = context.user.username
            } else if (shortcut === 'guilduser') {
                if (!guild) {
                    await editReply('❌ The `guilduser` shortcut can only be used in a guild channel')
                    return
                }
                username = context.member!.user.username ?? context.user.username
            }
            if (!username) {
                await editReply('❌ Unexpected error: Username could not be determined')
                return
            }
            try {
                await client.user!.setUsername(username)
                trackSuccessfulExecution()
            } catch (e) {
                if ((e as Error).message.includes('USERNAME_RATE_LIMIT')) {
                    await editReply('❌ Hit the username change rate limit')
                    return
                }
                await editReply(`❌ Error changing username: ${(e as Error).message}`)
                return
            }
            await editReply(`✅ Username changed to ${username}`)
            return
        }
    }
} satisfies SlashCommand
