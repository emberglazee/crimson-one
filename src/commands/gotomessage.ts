import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('gotomessage')
        .setDescription('Generates a link to a specific message')
        .addStringOption(option => option
            .setName('message_id')
            .setDescription('The ID of the message to link to. (CHECK OTHER OPTIONS)')
            .setRequired(true)
        ).addStringOption(option => option
            .setName('channel_id')
            .setDescription('The ID of the channel containing the message (defaults to the current channel).')
            .setRequired(false)
        ).addStringOption(option => option
            .setName('guild_id')
            .setDescription('The ID of the guild containing the message (defaults to the current guild).')
            .setRequired(false)
        ).addBooleanOption(option => option
            .setName('is_dm')
            .setDescription('Whether this is a DM message (uses @me instead of the guild ID).')
            .setRequired(false)
        ).setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        await ctx.deferReply({ flags: MessageFlags.Ephemeral })

        const messageId = ctx.getStringOption('message_id', true)
        const isDm = ctx.getBooleanOption('is_dm', false, ctx.channel?.isDMBased() ?? false)
        const targetChannelId = ctx.getStringOption('channel_id', false, ctx.channel?.id)
        const targetGuildId = ctx.getStringOption('guild_id', false, ctx.guild?.id)

        if (!targetChannelId) {
            await ctx.reply('No channel ID provided')
            return
        }

        const messageLink = isDm
            ? `https://discord.com/channels/@me/${targetChannelId}/${messageId}`
            : `https://discord.com/channels/${targetGuildId}/${targetChannelId}/${messageId}`

        await ctx.reply(`Here's your message link: ${messageLink}`)
    }
} satisfies SlashCommand
