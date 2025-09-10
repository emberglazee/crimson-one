import { Logger, TagManager, GuildConfigManager, CommandManager, CrimsonChat, MessageTrigger } from '../modules'
const logger = new Logger('event.messageCreate')

import util from 'util'
import { type Client, TextChannel } from 'discord.js'
import { normalizeUrl } from '../modules/CrimsonChat/util/url-utils'
import { parseMentions } from '../modules/CrimsonChat/util/formatters'
import { create, all } from 'mathjs'
import { toFeetInches } from '../util/functions'

interface MessageCreateServices {
    tagManager: TagManager
    guildConfigManager: GuildConfigManager
    commandManager: CommandManager
    crimsonChat: CrimsonChat
    messageTrigger: MessageTrigger
}

export default async function onMessageCreate(client: Client<true>, services: MessageCreateServices) {
    const { tagManager, guildConfigManager, commandManager, crimsonChat, messageTrigger } = services

    const math = create(all)

    client.on('messageCreate', async message => {
        try {
            if (message.author === client.user) return // Only ignore itself
            const { content } = message

            // --- "%" Commands ---
            if (content.startsWith('%')) {
                // Math evaluation (e.g., "% 5+5")
                if (content.startsWith('% ')) {

                    const expression = content.slice(2).trim()
                    if (!expression) return // Ignore empty expressions

                    try {

                        math.createUnit({
                            embil: {
                                baseName: 'length',
                                definition: '165 cm',
                                aliases: ['embi_length', 'embi_height']
                            },
                            embim: {
                                baseName: 'mass',
                                definition: '50 kg',
                                aliases: ['embi_weight', 'embi_mass']
                            },
                            ly: {
                                baseName: 'length',
                                definition: '9460730472580.8 km',
                                aliases: ['light_year']
                            },
                            au: {
                                baseName: 'length',
                                definition: '149597870.69 km',
                                aliases: ['astronomical_unit']
                            },
                            c0: {
                                baseName: 'length',
                                definition: '299792458 m/s',
                                aliases: ['light_speed']
                            }
                        }, { override: true, prefixes: 'long' })

                        const result = math.evaluate(expression, { toFeetInches })

                        let resultString = ''
                        if ((typeof result === 'object' || typeof result === 'function') && result !== null && result.toString)
                            resultString = result.toString()
                        else
                            resultString = String(result)

                        if (expression.replace(/\s+/g, '') === '9+10')
                            resultString = '21'

                        if (resultString.length > 1900)
                            resultString = resultString.substring(0, 1900) + '... (result truncated)'

                        await message.reply(`\`${expression}\` = \`${resultString}\``)

                    } catch (error) {
                        await message.reply(`❌ **Math.js Error:** \`${(error as Error).message}\``)
                    }
                    return
                }


                // --- Tag handling ---
                const guildConfig = await guildConfigManager.getConfig(message.guild?.id)
                if (!guildConfig.tagSystemEnabled) return // Silently ignore if not enabled

                // Tag creation (e.g., "%=tagname tag content here")
                if (content.startsWith('%=')) {
                    const tagName = content.slice(2).split(' ')[0]
                    if (!tagName) return // Silently ignore, maybe it wasn't intended as a tag call

                    const tagContent = content.slice(2 + tagName.length + 1)
                    if (!tagContent) {
                        await message.reply('❌ Tag content cannot be empty.\n-# ❕ If you want an image as the tag, copy the link to the image.')
                        return
                    }

                    const hasPerms = await tagManager.canModerateTags(message)
                    if (!hasPerms) {
                        await message.reply('❌ You do not have permission to moderate tags.')
                        return
                    }

                    if (await tagManager.getTag(message.guild!.id, tagName)) {
                        await message.reply(`❌ Tag "${tagName}" already exists.`)
                        return
                    }

                    await tagManager.createTag(message.guild!.id, tagName, tagContent, message.author.id)
                    await message.reply(`✅ Tag ${tagName} created.`)
                    return
                }
                // Tag deletion (e.g., "%-tagname")
                else if (content.startsWith('%-')) {
                    const tagName = content.slice(2).split(' ')[0]
                    if (!tagName) return // Silently ignore, maybe it wasn't intended as a tag call

                    const hasPerms = await tagManager.canModerateTags(message)
                    if (!hasPerms) {
                        await message.reply('❌ You do not have permission to moderate tags.')
                        return
                    }

                    const tag = await tagManager.getTag(message.guild!.id, tagName)
                    if (!tag) {
                        await message.reply(`❌ Tag "${tagName}" not found.`)
                        return
                    }

                    await tagManager.deleteTag(message.guild!.id, tagName)
                    await message.reply(`✅ Tag ${tagName} deleted.`)
                    return
                }
                // Tag retrieval (e.g., "%tagname")
                else {
                    const tagName = content.slice(1).split(' ')[0]
                    if (!tagName) return // Silently ignore, maybe it wasn't intended as a tag call

                    const tag = await tagManager.getTag(message.guild!.id, tagName)

                    if (!tag) {
                        await message.reply(`❌ Tag ${tagName} not found.`)
                        return
                    }

                    await message.reply(tag.content)

                    return
                }
            }



            // --- CrimsonChat handling ---
            const guildConfig = await guildConfigManager.getConfig(message.guild?.id)
            if (message.content.startsWith(guildConfig.prefix)) {
                await commandManager.handleMessageCommand(message, guildConfig.prefix)
            }
            if (guildConfig.messageTrigger) {
                await messageTrigger.processMessage(message)
            }

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
                    content += `\n< embed: ${JSON.stringify(message.embeds[0].toJSON())}>`
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
        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
