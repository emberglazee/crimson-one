import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('gotomessage')
        .setDescription('Generate a link to jump to a specific message')
        .addStringOption(so => so
            .setName('message_id')
            .setDescription('The ID of the message to link to')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('channel_id')
            .setDescription('The ID of the channel containing the message (defaults to current channel)')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('guild_id')
            .setDescription('The ID of the guild containing the message (defaults to current guild)')
            .setRequired(false)
        ).addBooleanOption(so => so
            .setName('is_dm')
            .setDescription('Whether this is a DM message (uses @me instead of guild ID)')
            .setRequired(false)
        ),
    async execute(context) {
        await context.deferReply({ ephemeral: true })

        const messageId = context.getStringOption('message_id', true)
        const isDm = context.getBooleanOption('is_dm', false, context.channel?.isDMBased() ?? false)
        const targetChannelId = context.getStringOption('channel_id', false, context.channel?.id)
        const targetGuildId = context.getStringOption('guild_id', false, context.guild?.id)

        if (!targetChannelId) {
            await context.reply('No channel ID provided')
            return
        }

        const messageLink = isDm
            ? `https://discord.com/channels/@me/${targetChannelId}/${messageId}`
            : `https://discord.com/channels/${targetGuildId}/${targetChannelId}/${messageId}`

        await context.reply(`Here's your message link: ${messageLink}`)
    }
} satisfies SlashCommand
