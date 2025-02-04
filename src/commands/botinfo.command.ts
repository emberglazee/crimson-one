import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
import { formatBytes } from '../util/functions'
import CrimsonChat from '../modules/CrimsonChat'
const logger = new Logger('command.botinfo')

export default {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Show bot statistics and information')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        const { heapUsed, heapTotal, rss } = process.memoryUsage()
        const uptime = Math.floor(process.uptime())
        const uptimeStr = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`
        const crimsonChat = CrimsonChat.getInstance()

        const application = await interaction.client.application.fetch()
        await interaction.reply({
            embeds: [{
                title: '🤖 Bot Information',
                fields: [
                    { name: 'Memory Usage', value: `Heap: ${formatBytes(heapUsed)}/${formatBytes(heapTotal)}\nRSS: ${formatBytes(rss)}`, inline: true },
                    { name: 'Uptime', value: uptimeStr, inline: true },
                    { name: 'Stats (approx.)', value: `Servers: ${application.approximateGuildCount ?? 'N/A'}\nUsers: ${application.approximateUserInstallCount ?? 'N/A'}`, inline: true },
                    { name: 'CrimsonChat', value: `Message history length: ${crimsonChat.historyManager.messageCount}\nTokens in message history: ${crimsonChat.historyManager.tokenCount}` }
                ],
                color: 0x2B2D31,
                timestamp: new Date().toISOString()
            }],
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
        logger.ok('Command executed')
    }
} satisfies SlashCommand
