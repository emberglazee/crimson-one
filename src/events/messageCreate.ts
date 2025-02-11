import { Client, Message, TextChannel } from 'discord.js'
import CrimsonChat from '../modules/CrimsonChat'
import { normalizeUrl } from '../modules/CrimsonChat/utils/urlUtils'
import { AdminCommandHandler } from '../modules/CrimsonChat/AdminCommands'
import util from 'util'
import { Logger } from '../util/logger'

const logger = Logger.new('event.messageCreate')

async function getLastMessages(channel: Message['channel'], limit = 15) {
    const messages = await channel.messages.fetch({ limit: limit + 1 }) // +1 to include current message
    return Array.from(messages.values())
        .reverse()
        .slice(0, -1) // Remove the current message
        .map(msg => ({
            content: msg.content,
            username: msg.author.username,
            displayName: msg.member?.displayName ?? msg.author.displayName,
            serverDisplayName: msg.member?.displayName ?? msg.author.displayName,
            guildName: msg.guild?.name,
            channelName: msg.channel instanceof TextChannel ? msg.channel.name : undefined
        }))
}

export default async function onMessageCreate(client: Client) {
    const crimsonChat = CrimsonChat.getInstance()
    crimsonChat.setClient(client)
    await crimsonChat.init()
    const adminCommands = new AdminCommandHandler()

    client.on('messageCreate', async message => {
        try {
            if (message.author === client.user) return

            const isMainChannel = message.channel.id === '1335992675459141632'
            const isTestingServer = message.guildId === '1335971145014579263'
            const isMentioned = message.mentions.users.has(client.user!.id)

            if ((isMainChannel || isTestingServer || isMentioned) && message.content.toLowerCase().includes('activation word: ronald mcdonald')) {
                await message.reply('https://cdn.discordapp.com/attachments/1125900471924699178/1303877939049402409/cachedVideo.mov?ex=67a2aff5&is=67a15e75&hm=437bf3939f3eee36a52a0fbf74c379fd25bd9a64db6c4763195266000c9cc8b2&')
                return
            }

            // Handle messages in main channel
            if (isMainChannel || isTestingServer) {
                // Handle admin commands first
                const wasAdminCommand = await adminCommands.handleCommand(message)
                if (wasAdminCommand) return

                // Skip processing if chat is disabled or user is banned
                if (!crimsonChat.isEnabled()) return
                if (crimsonChat.isBanned(message.author.id)) {
                    await message.react('❌')
                    return
                }

                let { content } = message

                // Handle forwarded messages
                if (message.messageSnapshots?.size > 0) {
                    const snapshots = Array.from(message.messageSnapshots.values())
                    const forwardedMessages = await Promise.all(
                        snapshots.map(async snapshot => {
                            try {
                                // Attempt to fetch the full message if we have the required IDs
                                if (snapshot.channelId && snapshot.id) {
                                    const channel = await client.channels.fetch(snapshot.channelId)
                                    if (channel?.isTextBased()) {
                                        const fullMessage = await channel.messages.fetch(snapshot.id)
                                        if (fullMessage) {
                                            return `[${fullMessage.author.username}]: ${fullMessage.content}`
                                        }
                                    }
                                }
                            } catch {
                                // Fall back to snapshot data if fetch fails
                            }
                            // Use snapshot data as fallback
                            return `[${snapshot.author!.username}]: ${snapshot.content}`
                        })
                    )
                    content += '\n< forwarded messages:\n' + forwardedMessages.join('\n') + ' >'
                }

                // Get reply context if message is a reply
                const respondingTo = message.reference?.messageId ? {
                    targetUsername: (await message.channel.messages.fetch(message.reference.messageId)).author.username,
                    targetText: (await message.channel.messages.fetch(message.reference.messageId)).content
                } : undefined

                // Collect all image URLs
                const imageAttachments = new Set<string>()

                // Add attachment images
                message.attachments.forEach(att => {
                    if (att.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name)) {
                        imageAttachments.add(normalizeUrl(att.url))
                    } else {
                        content += `\n< attachment: ${att.url} >`
                    }
                })

                // Add embed images
                message.embeds.forEach(embed => {
                    if (embed.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(embed.url)) {
                        imageAttachments.add(normalizeUrl(embed.url))
                    }
                    if (embed.thumbnail?.url) {
                        imageAttachments.add(normalizeUrl(embed.thumbnail.url))
                    }
                })

                // Handle other message content
                if (message.stickers.first()) {
                    content += `\n< sticker: ${message.stickers.first()!.name} >`
                }
                if (message.embeds.length) {
                    content += `\n< embed: ${JSON.stringify(message.embeds[0])} >`
                }

                await crimsonChat.sendMessage(content, {
                    username: message.author.username,
                    displayName: message.member!.displayName,
                    serverDisplayName: message.member?.displayName ?? message.author.displayName,
                    respondingTo,
                    imageAttachments: Array.from(imageAttachments),
                    guildName: message.guild?.name,
                    channelName: message.channel instanceof TextChannel ? message.channel.name : undefined
                }, message)
                return
            }
            // Handle mentions outside main channel
            if (isMentioned) {
                let { content } = message

                // Handle forwarded messages
                if (message.messageSnapshots?.size > 0) {
                    const snapshots = Array.from(message.messageSnapshots.values())
                    const forwardedMessages = await Promise.all(
                        snapshots.map(async snapshot => {
                            try {
                                // Attempt to fetch the full message if we have the required IDs
                                if (snapshot.channelId && snapshot.id) {
                                    const channel = await client.channels.fetch(snapshot.channelId)
                                    if (channel?.isTextBased()) {
                                        const fullMessage = await channel.messages.fetch(snapshot.id)
                                        if (fullMessage) {
                                            return `[${fullMessage.author.username}]: ${fullMessage.content}`
                                        }
                                    }
                                }
                            } catch {
                                // Fall back to snapshot data if fetch fails
                            }
                            // Use snapshot data as fallback
                            return `[${snapshot.author!.username}]: ${snapshot.content}`
                        })
                    )
                    content += '\n< forwarded messages:\n' + forwardedMessages.join('\n') + ' >'
                }

                // Get reply context if message is a reply
                const respondingTo = message.reference?.messageId ? {
                    targetUsername: (await message.channel.messages.fetch(message.reference.messageId)).author.username,
                    targetText: (await message.channel.messages.fetch(message.reference.messageId)).content
                } : undefined

                const imageAttachments = new Set<string>()
                // Add attachment images
                message.attachments.forEach(att => {
                    if (att.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name)) {
                        imageAttachments.add(normalizeUrl(att.url))
                    } else {
                        content += `\n< attachment: ${att.url} >`
                    }
                })

                // Add embed images
                message.embeds.forEach(embed => {
                    if (embed.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(embed.url)) {
                        imageAttachments.add(normalizeUrl(embed.url))
                    }
                    if (embed.thumbnail?.url) {
                        imageAttachments.add(normalizeUrl(embed.thumbnail.url))
                    }
                })

                // Handle stickers and other embeds
                if (!content.length && message.stickers.first()) {
                    content = `< sticker: ${message.stickers.first()!.name} >`
                }
                if (message.embeds.length) {
                    content += `\n< embed: ${JSON.stringify(message.embeds[0])} >`
                }

                // Get recent message context
                const contextMessages = await getLastMessages(message.channel)

                // Remove the explicit channel note since it's now included in the message format
                await crimsonChat.sendMessage(content, {
                    username: message.author.username,
                    displayName: message.member!.displayName,
                    serverDisplayName: message.member?.displayName ?? message.author.displayName,
                    respondingTo,
                    imageAttachments: Array.from(imageAttachments),
                    contextMessages,
                    targetChannel: message.channel as TextChannel,
                    guildName: message.guild?.name,
                    channelName: message.channel instanceof TextChannel ? message.channel.name : undefined
                }, message)
            }
        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
