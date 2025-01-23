import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
import { formatBytes } from '../util/functions'
const logger = new Logger('command.botinfo')

export default {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Show bot statistics and information'),
    async execute(interaction) {
        const { heapUsed, heapTotal, rss } = process.memoryUsage()
        const uptime = Math.floor(process.uptime())
        const uptimeStr = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
        
        await interaction.reply({
            embeds: [{
                title: '🤖 Bot Information',
                fields: [
                    { name: 'Memory Usage', value: `Heap: ${formatBytes(heapUsed)}/${formatBytes(heapTotal)}\nRSS: ${formatBytes(rss)}`, inline: true },
                    { name: 'Uptime', value: uptimeStr, inline: true },
                    { name: 'Stats', value: `Servers: ${interaction.client.application?.approximateGuildCount ?? 'N/A'}\nUsers: ${interaction.client.application?.approximateUserInstallCount ?? 'N/A'}`, inline: true }
                ],
                color: 0x2B2D31,
                timestamp: new Date().toISOString()
            }]
        })
        logger.ok('Command executed')
    }
} satisfies SlashCommand
