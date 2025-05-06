import { Logger } from '../util/logger'
const logger = new Logger('/shapesinc')

import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import { GuildSlashCommand } from '../types/types'
import ShapesInc from '../modules/ShapesInc'
import { inspect } from 'util'

export default {
    data: new SlashCommandBuilder()
        .setName('shapesinc')
        .setDescription('Precise control over the ShapesInc bot session')
        .addSubcommand(sc => sc
            .setName('init')
            .setDescription('Initialize and log in the ShapesInc browser session')
        ).addSubcommand(sc => sc
            .setName('close')
            .setDescription('Close the ShapesInc browser session')
        ).addSubcommand(sc => sc
            .setName('status')
            .setDescription('Check login status (web and API)')
        ).addSubcommand(sc => sc
            .setName('send')
            .setDescription('Send a message to Crimson 1')
            .addStringOption(so => so
                .setName('message')
                .setDescription('Message to send')
                .setRequired(true)
            ).addStringOption(so => so
                .setName('attachment_url')
                .setDescription('Optional attachment URL')
                .setRequired(false))
        ).addSubcommand(sc => sc
            .setName('history')
            .setDescription('Get the last 20 chat messages')
        ).addSubcommand(sc => sc
            .setName('clear')
            .setDescription('Clear the chat')),
    async execute({ reply, myId }, interaction) {
        const sub = interaction.options.getSubcommand()
        if (interaction.user.id !== myId) {
            await reply({ content: 'get out of my head get out of my head get out of my head get out of my head ', flags: MessageFlags.Ephemeral })
            logger.info(`{execute} User ${interaction.user.id} (${interaction.user.username}) tried to use command but is not ${myId}`)
            return
        }
        const shapes = ShapesInc.getInstance()
        try {
            if (sub === 'init') {
                await shapes.init()
                await reply({ content: '✅ ShapesInc session initialized and logged in.', flags: MessageFlags.Ephemeral })
            } else if (sub === 'close') {
                await shapes.close()
                await reply({ content: '✅ ShapesInc session closed.', flags: MessageFlags.Ephemeral })
            } else if (sub === 'status') {
                await shapes.init()
                const web = await shapes.webCheckIfLoggedIn()
                const api = await shapes.apiCheckIfLoggedIn()
                await reply({ content: `Web login: ${web ? '✅' : '❌'}\nAPI login: ${api ? '✅' : '❌'}`, flags: MessageFlags.Ephemeral })
            } else if (sub === 'send') {
                await shapes.init()
                await shapes.gotoCrimson1()
                const message = interaction.options.getString('message', true)
                const attachment_url = interaction.options.getString('attachment_url') ?? null
                const res = await shapes.sendMessage(message, attachment_url)
                await reply({ content: `✅ Sent!\nText: ${res.text}\nVoice: ${res.voice_reply_url ?? 'none'}\nTimestamp: ${res.timestamp}`, flags: MessageFlags.Ephemeral })
            } else if (sub === 'history') {
                await shapes.init()
                await shapes.gotoCrimson1()
                const history = await shapes.getChatHistory()
                const formatted = history.map((m, i) => `#${i + 1}: ${m.message ?? '(no message)'}${m.reply ? `\n↪️ ${m.reply}` : ''} [${m.ts}]`).join('\n\n')
                await reply({ content: `Last 20 messages:\n${formatted}`, flags: MessageFlags.Ephemeral })
            } else if (sub === 'clear') {
                await shapes.init()
                await shapes.gotoCrimson1()
                await shapes.clearChat(1746508326)
                await reply({ content: `✅ Cleared chat`, flags: MessageFlags.Ephemeral })
            } else {
                await reply({ content: '❌ Unknown subcommand.', flags: MessageFlags.Ephemeral })
            }
        } catch (err) {
            await reply({ content: `❌ Error: ${err instanceof Error ? err.message : String(err)}`, flags: MessageFlags.Ephemeral })
        } finally {
            if (sub !== 'close') {
                try { await shapes.close() } catch (err) {
                    logger.error(`{execute} Error closing ShapesInc session:\n${err instanceof Error ? err.stack ?? err.message : inspect(err)}`)
                }
            }
        }
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
