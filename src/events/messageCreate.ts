import { Logger } from '../util/logger'
const logger = new Logger('event.messageCreate')

import { type Client, TextChannel } from 'discord.js'
import util from 'util'
import { messageTrigger, shapesInc, crimsonChat, modeManager } from '..'
import GuildConfigManager from '../modules/GuildConfig'
import CommandManager from '../modules/CommandManager/index'
import { normalizeUrl } from '../modules/CrimsonChat/util/url-utils'
import { parseMentions } from '../modules/CrimsonChat/util/formatters'
import { evaluate } from 'mathjs'

export default async function onMessageCreate(client: Client<true>) {
    client.on('messageCreate', async message => {
        try {
            if (message.author === client.user) return // Only ignore itself
            if (await shapesInc.handlePotentialCookieDM(message)) return

            // Math.js evaluation logic
            if (message.content.startsWith('% ')) {
                const expression = message.content.slice(2).trim()
                if (!expression) return // Ignore empty expressions

                try {
                    const result = evaluate(expression)
                    // Use math.js's own string formatting for complex types
                    let resultString = ''
                    if (typeof result === 'object' && result !== null && result.toString) {
                        resultString = result.toString()
                    } else if (typeof result === 'function') {
                        resultString = 'Cannot display function definitions.'
                    } else {
                        resultString = String(result)
                    }


                    if (resultString.length > 1900) {
                        resultString = resultString.substring(0, 1900) + '... (result truncated)'
                    }

                    await message.reply(`\`\`\`\n${resultString}\n\`\`\``)
                } catch (error) {
                    await message.reply(`❌ **Math Error:**\n\`\`\`\n${(error as Error).message}\n\`\`\``)
                }
                return // Stop further processing for this message
            }


            const guildConfig = await GuildConfigManager.getInstance().getConfig(message.guild?.id)
            if (message.content.startsWith(guildConfig.prefix)) {
                await CommandManager.getInstance().handleMessageCommand(message, guildConfig.prefix)
            }
            if (guildConfig.messageTrigger) {
                await messageTrigger.processMessage(message)
            }

            const activeMode = modeManager.getActiveMode()

            if (activeMode === 'crimsonchat') {
                // CrimsonChat Logic
                const isMainChannel = message.channel.id === '1335992675459141632'
                const isTestingServer = message.guildId === '1335971145014579263'
                const isMentioned = message.mentions.users.has(client.user.id)

                if (isMainChannel || isTestingServer || isMentioned) {
                    if (!crimsonChat.isEnabled() || crimsonChat.isIgnored(message.author.id)) {
                        if (crimsonChat.isIgnored(message.author.id)) await message.react('❌')
                        return
                    }

                    let { content } = message

                    // --- Common Message Processing ---

                    // Handle forwarded messages (Snapshots)
                    if (message.messageSnapshots?.size > 0) {
                        const forwardedMessages = (await Promise.all(
                            Array.from(message.messageSnapshots.values()).map(async snapshot => {
                                try {
                                    if (snapshot.channelId && snapshot.id) {
                                        const channel = await client.channels.fetch(snapshot.channelId)
                                        if (channel?.isTextBased()) {
                                            const fullMessage = await channel.messages.fetch(snapshot.id)
                                            return `[${fullMessage.author.username}]: ${fullMessage.content}`
                                        }
                                    }
                                } catch { /* Fallback below */ }
                                return `[${snapshot.author!.username}]: ${snapshot.content}`
                            })
                        )).join('\n')
                        content += `\n< forwarded messages:\n${forwardedMessages}\n>`
                    }

                    // Get reply context
                    const respondingTo = message.reference?.messageId ? {
                        targetUsername: (await message.channel.messages.fetch(message.reference.messageId)).author.username,
                        targetText: (await message.channel.messages.fetch(message.reference.messageId)).content
                    } : undefined

                    // Collect image attachments
                    const imageAttachments = new Set<string>()
                    message.attachments.forEach(att => {
                        if (att.contentType?.startsWith('image/')) {
                            imageAttachments.add(normalizeUrl(att.url))
                        } else {
                            content += `\n< attachment: ${att.url} >`
                        }
                    })

                    // Collect embed images
                    message.embeds.forEach(embed => {
                        if (embed.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(embed.url)) {
                            imageAttachments.add(normalizeUrl(embed.url))
                        }
                        if (embed.thumbnail?.url) {
                            imageAttachments.add(normalizeUrl(embed.thumbnail.url))
                        }
                    })

                    // Handle other content types
                    if (message.stickers.first()) {
                        content += `\n< sticker: ${message.stickers.first()!.name} >`
                    }
                    if (message.embeds.length > 0) {
                        content += `\n< embed: ${JSON.stringify(message.embeds[0].toJSON())} >`
                    }

                    // Parse Discord mentions into our required JSON format
                    content = await parseMentions(client, content)

                    crimsonChat.sendMessage(content, {
                        messageContent: content,
                        username: message.author.username,
                        displayName: message.member?.displayName ?? message.author.displayName,
                        serverDisplayName: message.member?.displayName ?? message.author.displayName,
                        respondingTo,
                        imageAttachments: Array.from(imageAttachments),
                        targetChannel: (isMentioned && !isMainChannel) ? (message.channel as TextChannel) : undefined,
                        guildName: message.guild?.name,
                        channelName: message.channel instanceof TextChannel ? message.channel.name : undefined
                    }, message)
                }
            } else if (activeMode === 'shapesinc') {
                if (modeManager.isShapesIncSolo()) {
                    await shapesInc.handleMessage(message, 'crimson-1')
                } else {
                    await shapesInc.handleMessage(message)
                }
            }
        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
