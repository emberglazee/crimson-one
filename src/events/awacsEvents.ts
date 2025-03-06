import { AuditLogEvent, Client, GuildAuditLogsEntry, TextChannel } from 'discord.js'
import { Logger } from '../util/logger'
import { AWACSFeed } from '../modules/AWACSFeed'

const logger = new Logger('awacsEvents')

// The target guild ID that AWACS should monitor
const TARGET_GUILD_ID = '958518067690868796'

// Tracking recently processed events to avoid duplicates when combining immediate events with audit logs
interface TrackedEvent {
    id: string
    type: string
    timestamp: number
}

// Keep track of recently processed events to avoid duplicates
const recentEvents = new Map<string, TrackedEvent>()
const RECENT_EVENT_EXPIRY = 30000 // 30 seconds before an event can be "rediscovered"

// Helper function to track events
function trackEvent(type: string, targetId: string): string {
    const eventId = `${type}-${targetId}-${Date.now()}`
    recentEvents.set(eventId, {
        id: eventId,
        type,
        timestamp: Date.now()
    })

    // Clean up old events
    for (const [id, event] of recentEvents.entries()) {
        if (Date.now() - event.timestamp > RECENT_EVENT_EXPIRY) {
            recentEvents.delete(id)
        }
    }

    return eventId
}

// Check if we've recently processed an event of this type for this target
function hasRecentEvent(type: string, targetId: string): boolean {
    for (const [_, event] of recentEvents.entries()) {
        if (event.type === type && 
            event.id.includes(targetId) && 
            Date.now() - event.timestamp < RECENT_EVENT_EXPIRY) {
            return true
        }
    }
    return false
}

// Helper function to get the audit log entry for a specific event
async function getAuditLogEntry(
    guildId: string, 
    client: Client, 
    eventType: AuditLogEvent, 
    targetId?: string, 
    timeWindow: number = 5000
): Promise<GuildAuditLogsEntry | null> {
    // Only get audit logs for the target guild
    if (guildId !== TARGET_GUILD_ID) return null
    
    try {
        const guild = await client.guilds.fetch(guildId)
        const auditLogs = await guild.fetchAuditLogs({
            type: eventType,
            limit: 5 // Fetch a few to ensure we find the right one
        })

        if (!auditLogs.entries.size) return null

        // Get the most recent entry within our time window
        const now = Date.now()
        const entry = targetId 
            ? auditLogs.entries.find(
                entry => ('id' in (entry.target || {}) && (entry.target as { id: string }).id === targetId) && 
                now - entry.createdTimestamp < timeWindow
            ) : auditLogs.entries.first()

        return entry || null
    } catch (error) {
        logger.warn(`Failed to fetch audit logs: ${(error as Error).message}`)
        return null
    }
}

export default function registerAwacsEvents(client: Client): void {
    const awacs = AWACSFeed.getInstance()
    awacs.setClient(client)

    logger.info(`AWACS configured to track only guild with ID: ${TARGET_GUILD_ID}`)

    // Member join event
    client.on('guildMemberAdd', async member => {
        // Skip events from non-target guilds
        if (member.guild.id !== TARGET_GUILD_ID) return
        if (!awacs.getChannelId()) return

        // Track this event to avoid duplicate logging
        trackEvent('guildMemberAdd', member.id)

        awacs.emit('memberJoin', {
            memberId: member.id,
            memberName: member.displayName,
            guildId: member.guild.id,
            guildName: member.guild.name,
            joinedAt: new Date(member.joinedTimestamp!)
        })
    })

    // Member leave event
    client.on('guildMemberRemove', async member => {
        // Skip events from non-target guilds
        if (member.guild.id !== TARGET_GUILD_ID) return
        if (!awacs.getChannelId()) return

        // Check if this was a ban (handled by guildBanAdd) or a kick (from audit logs)
        const banEntry = await getAuditLogEntry(member.guild.id, client, AuditLogEvent.MemberBanAdd, member.id)
        if (banEntry) return // This is a ban, will be handled by guildBanAdd event

        // Check if this was a kick
        const kickEntry = await getAuditLogEntry(member.guild.id, client, AuditLogEvent.MemberKick, member.id)
        if (kickEntry) {
            // This was a kick, not a regular leave
            trackEvent('memberKick', member.id)

            awacs.sendQuickEvent({
                title: "Pilot Ejected",
                description: `**${member.displayName}** was kicked from the server.`,
                type: "warning",
                fields: [
                    { name: "Member", value: member.displayName, inline: true },
                    { name: "By", value: kickEntry.executor?.tag || "Unknown", inline: true },
                    { name: "Reason", value: kickEntry.reason || "No reason provided" }
                ]
            })
            return
        }

        // Track this event
        trackEvent('guildMemberRemove', member.id)

        awacs.emit('memberLeave', {
            memberId: member.id,
            memberName: member.displayName,
            guildId: member.guild.id,
            guildName: member.guild.name,
            leftAt: new Date()
        })
    })

    // Message delete event
    client.on('messageDelete', async message => {
        // Skip events from non-target guilds, DMs, or from bots
        if (!message.guild || message.guild.id !== TARGET_GUILD_ID || !awacs.getChannelId() || message.author?.bot) return

        const channel = message.channel as TextChannel

        // Track this event
        trackEvent('messageDelete', message.id)

        // Try to get information about who deleted the message
        const auditEntry = await getAuditLogEntry(
            message.guild?.id || '', 
            client, 
            AuditLogEvent.MessageDelete, 
            message.id, 
            10000
        )

        // If we found audit log info about who deleted it and it wasn't the author
        let deletedByModerator = false
        if (auditEntry && auditEntry.executorId !== message.author?.id) {
            deletedByModerator = true

            awacs.sendQuickEvent({
                title: "Message Removed by Moderator",
                description: `A message by **${message.author?.displayName || 'Unknown'}** was deleted by **${auditEntry.executor?.displayName || 'Unknown'}** in <#${channel.id}>.`,
                type: "warning",
                fields: [
                    { name: "Content", value: message.content || "(No text content)" }
                ]
            })
        }

        // Only emit the regular event if it wasn't a moderation action
        if (!deletedByModerator) {
            awacs.emit('messageDelete', {
                messageId: message.id,
                channelId: message.channelId,
                channelName: channel.name,
                authorId: message.author?.id ?? null,
                authorName: message.author?.displayName ?? null,
                content: message.content || null,
                deletedAt: new Date()
            })
        }
    })

    // Message edit event
    client.on('messageUpdate', async (oldMessage, newMessage) => {
        // Skip events from non-target guilds, DMs, or from bots
        if (!newMessage.guild || newMessage.guild.id !== TARGET_GUILD_ID || 
            !awacs.getChannelId() || 
            newMessage.author?.bot || 
            !oldMessage.content || 
            !newMessage.content || 
            oldMessage.content === newMessage.content) return

        const channel = newMessage.channel as TextChannel

        // Track this event
        trackEvent('messageUpdate', newMessage.id)

        awacs.emit('messageEdit', {
            messageId: newMessage.id,
            channelId: newMessage.channelId,
            channelName: channel.name,
            authorId: newMessage.author!.id,
            authorName: newMessage.author!.displayName,
            oldContent: oldMessage.content,
            newContent: newMessage.content,
            editedAt: new Date()
        })
    })

    // Channel create event
    client.on('channelCreate', async channel => {
        // Skip events from non-target guilds or DMs
        if (channel.isDMBased() || !channel.guild || channel.guild.id !== TARGET_GUILD_ID || !awacs.getChannelId()) return

        // Track this event
        trackEvent('channelCreate', channel.id)

        // Try to get more info from audit logs
        const auditEntry = await getAuditLogEntry(
            channel.guild.id,
            client,
            AuditLogEvent.ChannelCreate,
            channel.id
        )

        if (auditEntry) {
            // Use the enhanced info from audit logs
            awacs.sendQuickEvent({
                title: "New Communications Channel Established",
                description: `Channel <#${channel.id}> (**${channel.name}**) has been created by ${auditEntry.executor?.tag || "System"}.`,
                type: "success",
                fields: [
                    { name: "Creator", value: auditEntry.executor?.tag || "System", inline: true },
                    { name: "Type", value: channel.type.toString(), inline: true }
                ]
            })
        } else {
            // Fall back to basic event
            awacs.emit('channelCreate', {
                channelId: channel.id,
                channelName: channel.name,
                guildId: channel.guild.id,
                guildName: channel.guild.name,
                timestamp: new Date()
            })
        }
    })

    // Channel delete event
    client.on('channelDelete', async channel => {
        // Skip events from non-target guilds or DMs
        if (channel.isDMBased() || !channel.guild || channel.guild.id !== TARGET_GUILD_ID || !awacs.getChannelId()) return

        // Track this event
        trackEvent('channelDelete', channel.id)

        // Try to get more info from audit logs
        const auditEntry = await getAuditLogEntry(
            channel.guild.id,
            client,
            AuditLogEvent.ChannelDelete,
            channel.id
        )

        if (auditEntry) {
            // Use the enhanced info from audit logs
            awacs.sendQuickEvent({
                title: "Communications Channel Lost",
                description: `Channel **${channel.name}** has been deleted by ${auditEntry.executor?.tag || "System"}.`,
                type: "warning",
                fields: [
                    { name: "Deleted by", value: auditEntry.executor?.tag || "System" }
                ]
            })
        } else {
            // Fall back to basic event
            awacs.emit('channelDelete', {
                channelId: channel.id,
                channelName: channel.name,
                guildId: channel.guild.id,
                guildName: channel.guild.name,
                timestamp: new Date()
            })
        }
    })

    // Role create event
    client.on('roleCreate', async role => {
        // Skip events from non-target guilds
        if (role.guild.id !== TARGET_GUILD_ID || !awacs.getChannelId()) return

        // Track this event
        trackEvent('roleCreate', role.id)

        // Try to get more info from audit logs
        const auditEntry = await getAuditLogEntry(
            role.guild.id,
            client,
            AuditLogEvent.RoleCreate,
            role.id
        )

        if (auditEntry) {
            // Use the enhanced info from audit logs
            awacs.sendQuickEvent({
                title: "New Command Rank Established",
                description: `Role **${role.name}** has been created by ${auditEntry.executor?.tag || "System"}.`,
                type: "success",
                fields: [
                    { name: "Created by", value: auditEntry.executor?.tag || "System", inline: true },
                    { name: "Color", value: role.hexColor || "None", inline: true }
                ]
            })
        } else {
            // Fall back to basic event
            awacs.emit('roleCreate', {
                roleId: role.id,
                roleName: role.name,
                roleColor: role.hexColor,
                guildId: role.guild.id,
                guildName: role.guild.name,
                timestamp: new Date()
            })
        }
    })

    // Role delete event
    client.on('roleDelete', async role => {
        // Skip events from non-target guilds
        if (role.guild.id !== TARGET_GUILD_ID || !awacs.getChannelId()) return

        // Track this event
        trackEvent('roleDelete', role.id)

        // Try to get more info from audit logs
        const auditEntry = await getAuditLogEntry(
            role.guild.id,
            client,
            AuditLogEvent.RoleDelete,
            role.id
        )

        if (auditEntry) {
            // Use the enhanced info from audit logs
            awacs.sendQuickEvent({
                title: "Command Rank Decommissioned",
                description: `Role **${role.name}** has been deleted by ${auditEntry.executor?.tag || "System"}.`,
                type: "warning",
                fields: [
                    { name: "Deleted by", value: auditEntry.executor?.tag || "System" }
                ]
            })
        } else {
            // Fall back to basic event
            awacs.emit('roleDelete', {
                roleId: role.id,
                roleName: role.name,
                roleColor: role.hexColor,
                guildId: role.guild.id,
                guildName: role.guild.name,
                timestamp: new Date()
            })
        }
    })

    // Member ban event
    client.on('guildBanAdd', async ban => {
        // Skip events from non-target guilds
        if (ban.guild.id !== TARGET_GUILD_ID || !awacs.getChannelId()) return

        // Track this event
        trackEvent('guildBanAdd', ban.user.id)

        // Get audit log to find who did the ban and why
        const entry = await getAuditLogEntry(ban.guild.id, client, AuditLogEvent.MemberBanAdd, ban.user.id)

        awacs.emit('memberBan', {
            memberId: ban.user.id,
            memberName: ban.user.displayName,
            moderatorId: entry?.executorId || null,
            moderatorName: entry?.executor?.displayName || null,
            guildId: ban.guild.id,
            guildName: ban.guild.name,
            reason: entry?.reason || ban.reason || null,
            timestamp: new Date()
        })
    })

    // Member unban event
    client.on('guildBanRemove', async ban => {
        // Skip events from non-target guilds
        if (ban.guild.id !== TARGET_GUILD_ID || !awacs.getChannelId()) return

        // Track this event
        trackEvent('guildBanRemove', ban.user.id)

        // Get audit log to find who did the unban
        const entry = await getAuditLogEntry(ban.guild.id, client, AuditLogEvent.MemberBanRemove, ban.user.id)

        awacs.emit('memberUnban', {
            memberId: ban.user.id,
            memberName: ban.user.displayName,
            moderatorId: entry?.executorId || null,
            moderatorName: entry?.executor?.displayName || null,
            guildId: ban.guild.id,
            guildName: ban.guild.name,
            reason: entry?.reason || null,
            timestamp: new Date()
        })
    })

    // Member timeout event (using audit logs since there's no direct event)
    client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
        // Skip events from non-target guilds
        if (guild.id !== TARGET_GUILD_ID || !awacs.getChannelId()) return

        if (auditLogEntry.action === AuditLogEvent.MemberUpdate && 
            auditLogEntry.changes.find(c => c.key === 'communication_disabled_until')) {

            const change = auditLogEntry.changes.find(c => c.key === 'communication_disabled_until')
            if (!change || !change.new) return // Timeout was removed, not added

            // Get the timeout end time
            const timeoutEndTimestamp = new Date((change.new as string)).getTime()
            const timeoutDuration = timeoutEndTimestamp - Date.now()

            // Only log if the timeout is still active and not removal of a timeout
            if (timeoutDuration > 0) {
                // Fetch the member who was timed out
                try {
                    const member = await guild.members.fetch(auditLogEntry.targetId!)

                    // Track this event
                    trackEvent('memberTimeout', member.id)

                    awacs.emit('memberTimeout', {
                        memberId: member.id,
                        memberName: member.displayName,
                        moderatorId: auditLogEntry.executorId,
                        moderatorName: auditLogEntry.executor?.displayName || null,
                        guildId: guild.id,
                        guildName: guild.name,
                        reason: auditLogEntry.reason || null,
                        timestamp: new Date(),
                        duration: timeoutDuration
                    })
                } catch (error) {
                    logger.warn(`Couldn't fetch member for timeout event: ${(error as Error).message}`)
                }
            }
        }
    })

    logger.ok(`AWACS event handlers registered for guild ID: ${TARGET_GUILD_ID}`)
}
