import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, TextChannel } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { AWACSFeed } from '../modules/AWACSFeed'
import { Logger } from '../util/logger'

const logger = new Logger('AWACSCommand')

export default {
    data: new SlashCommandBuilder()
        .setName('awacs')
        .setDescription('Configure the AWACS audit log system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand
            .setName('setchannel')
            .setDescription('Set the channel where AWACS logs will be sent')
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('The channel to send AWACS logs to')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('status')
            .setDescription('Check the current AWACS feed status')
        )
        .addSubcommand(subcommand => subcommand
            .setName('test')
            .setDescription('Send a test AWACS message')
            .addStringOption(option => option
                .setName('event')
                .setDescription('The type of event to simulate')
                .setRequired(true)
                .addChoices(
                    { name: 'Member Join', value: 'join' },
                    { name: 'Member Leave', value: 'leave' },
                    { name: 'Message Delete', value: 'messagedelete' },
                    { name: 'Channel Create', value: 'channelcreate' },
                    { name: 'Member Ban', value: 'ban' },
                    { name: 'Custom', value: 'custom' }
                )
            )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand()
        const awacs = AWACSFeed.getInstance()

        // Initialize AWACSFeed with the client if not done elsewhere
        if (!awacs.getChannelId()) {
            awacs.setClient(interaction.client)
        }

        if (subcommand === 'setchannel') {
            const channel = interaction.options.getChannel('channel', true) as TextChannel
            
            try {
                if (awacs.getChannelId()) {
                    await awacs.setChannel(channel.id)
                    await interaction.reply({
                        content: `✅ AWACS feed channel updated to <#${channel.id}>`,
                        ephemeral: true
                    })
                } else {
                    await awacs.init(interaction.client, channel.id)
                    await interaction.reply({
                        content: `✅ AWACS feed initialized with channel <#${channel.id}>`,
                        ephemeral: true
                    })
                }
                
                // Send a welcome message to the channel
                await channel.send({
                    content: '```\nAWACS FEED ONLINE\n\n' +
                        'SYSTEM: CRIMSON\nSTATUS: OPERATIONAL\n' +
                        'MONITORING ALL COMMUNICATIONS CHANNELS\n```'
                })
            } catch (error) {
                logger.error(`Failed to set AWACS channel: ${(error as Error).message}`)
                await interaction.reply({
                    content: `❌ Failed to set AWACS channel: ${(error as Error).message}`,
                    ephemeral: true
                })
            }
        }
        else if (subcommand === 'status') {
            const channelId = awacs.getChannelId()
            
            if (!channelId) {
                await interaction.reply({
                    content: '❌ AWACS feed is not configured. Use `/awacs setchannel` to set it up.',
                    ephemeral: true
                })
                return
            }
            
            try {
                const channel = await interaction.client.channels.fetch(channelId) as TextChannel
                await interaction.reply({
                    content: `📡 AWACS feed status:\n- Active: Yes\n- Channel: <#${channelId}> (${channel.name})\n- Ready to receive audit logs`,
                    ephemeral: true
                })
            } catch (error) {
                await interaction.reply({
                    content: `⚠️ AWACS feed is configured but the channel could not be found. Channel ID: ${channelId}. Consider setting a new channel.`,
                    ephemeral: true
                })
            }
        }
        else if (subcommand === 'test') {
            const channelId = awacs.getChannelId()
            
            if (!channelId) {
                await interaction.reply({
                    content: '❌ AWACS feed is not configured. Use `/awacs setchannel` to set it up.',
                    ephemeral: true
                })
                return
            }
            
            const eventType = interaction.options.getString('event', true)
            const now = new Date()
            
            try {
                switch (eventType) {
                    case 'join':
                        awacs.emit('memberJoin', {
                            memberId: interaction.user.id,
                            memberName: interaction.user.displayName,
                            guildId: interaction.guild!.id,
                            guildName: interaction.guild!.name,
                            joinedAt: now
                        })
                        break
                    case 'leave':
                        awacs.emit('memberLeave', {
                            memberId: interaction.user.id,
                            memberName: interaction.user.displayName,
                            guildId: interaction.guild!.id,
                            guildName: interaction.guild!.name,
                            leftAt: now
                        })
                        break
                    case 'messagedelete':
                        awacs.emit('messageDelete', {
                            messageId: '123456789012345678',
                            channelId: interaction.channel!.id,
                            channelName: (interaction.channel as TextChannel).name,
                            authorId: interaction.user.id,
                            authorName: interaction.user.displayName,
                            content: 'This is a test message that was deleted.',
                            deletedAt: now
                        })
                        break
                    case 'channelcreate':
                        awacs.emit('channelCreate', {
                            channelId: interaction.channel!.id,
                            channelName: (interaction.channel as TextChannel).name,
                            guildId: interaction.guild!.id,
                            guildName: interaction.guild!.name,
                            timestamp: now
                        })
                        break
                    case 'ban':
                        awacs.emit('memberBan', {
                            memberId: interaction.user.id,
                            memberName: interaction.user.displayName,
                            moderatorId: interaction.client.user!.id,
                            moderatorName: interaction.client.user!.username,
                            guildId: interaction.guild!.id,
                            guildName: interaction.guild!.name,
                            reason: 'This is a test ban reason.',
                            timestamp: now
                        })
                        break
                    case 'custom':
                        awacs.sendQuickEvent({
                            title: 'Test Event',
                            description: `This is a test event triggered by ${interaction.user.displayName}.`,
                            type: 'info',
                            callsign: 'TEST',
                            fields: [
                                { name: 'User', value: interaction.user.tag, inline: true },
                                { name: 'Channel', value: (interaction.channel as TextChannel).name, inline: true }
                            ]
                        })
                        break
                }
                
                await interaction.reply({
                    content: `✅ Test ${eventType} event sent to AWACS feed.`,
                    ephemeral: true
                })
            } catch (error) {
                logger.error(`Error sending test event: ${(error as Error).message}`)
                await interaction.reply({
                    content: `❌ Error sending test event: ${(error as Error).message}`,
                    ephemeral: true
                })
            }
        }
    }
} satisfies SlashCommand