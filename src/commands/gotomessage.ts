import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

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
    async execute({ reply }, interaction) {
        const messageId = interaction.options.getString('message_id', true)
        const isDm = interaction.options.getBoolean('is_dm') ?? interaction.channel?.isDMBased() ?? false
        const channelId = interaction.options.getString('channel_id') ?? interaction.channelId
        const guildId = interaction.options.getString('guild_id') ?? interaction.guildId

        const messageLink = isDm
            ? `https://discord.com/channels/@me/${channelId}/${messageId}`
            : `https://discord.com/channels/${guildId}/${channelId}/${messageId}`

        await reply(`Here's your message link: ${messageLink}`)
    }
} satisfies SlashCommand
