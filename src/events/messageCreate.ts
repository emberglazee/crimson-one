import {
    Logger,
    TagManager,
    ServerConfigManager,
    CommandManager,
    CrimsonChat,
    MessageTrigger,
    AntiRaidManager,
    MarkovBotManager,
    MarkovChat
} from '../modules'
import { distance } from 'fastest-levenshtein'
const logger = new Logger('event.messageCreate')
import { type Client, TextChannel, Message } from 'discord.js'
import { normalizeUrl } from '../modules/CrimsonChat/util/url-utils'
import { parseMentions } from '../modules/CrimsonChat/util/formatters'
import { evaluateMathWorker } from '../util/mathEvaluator'
import util from 'util'
import {
    QOTD_ANSWERS_CHANNEL_ID,
    QOTD_CHANNEL_ID,
    QOTD_ROLE_ID,
    SOLITARY_CONFINEMENT_GUILD_ID
} from '../util/constants'

interface MessageCreateServices {
    tagManager: TagManager
    serverConfigManager: ServerConfigManager
    commandManager: CommandManager
    crimsonChat: CrimsonChat
    messageTrigger: MessageTrigger
    antiRaidManager: AntiRaidManager
    markovBotManager: MarkovBotManager
    markovChat: MarkovChat
}

async function handleQOTD(
    message: Message,
    { crimsonChat }: Pick<MessageCreateServices, 'crimsonChat'>
): Promise<void> {
    if (
        message.guildId !== SOLITARY_CONFINEMENT_GUILD_ID ||
        message.channelId !== QOTD_CHANNEL_ID
    ) {
        return
    }

    if (!message.mentions.roles.has(QOTD_ROLE_ID)) {
        return
    }

    const botMember = message.guild?.members.me
    if (!botMember?.roles.cache.has(QOTD_ROLE_ID)) {
        return
    }

    const answersChannel = (await message.client.channels
        .fetch(QOTD_ANSWERS_CHANNEL_ID)
        .catch(() => null)) as TextChannel | null
    if (!answersChannel) {
        logger.warn(
            `QOTD answers channel with ID ${QOTD_ANSWERS_CHANNEL_ID} not found.`
        )
        return
    }

    const forwardedMessage = await answersChannel.send({
        content: `> ${message.author.toString()} in ${message.channel.toString()} asked:\n${message.content}`,
        allowedMentions: { users: [] }
    })

    crimsonChat.sendMessage(
        message.content,
        {
            messageContent: message.content,
            username: message.author.username,
            displayName:
                message.member?.displayName ?? message.author.displayName,
            serverDisplayName:
                message.member?.displayName ?? message.author.displayName,
            guildName: message.guild?.name,
            channelName: answersChannel.name,
            targetChannel: answersChannel
        },
        forwardedMessage
    )
}

async function handleMathCommand(message: Message): Promise<void> {
    const expression = message.content.slice(2).trim()
    if (!expression) return

    logger.info(`Processing math expression: ${expression}`)

    try {
        const resultString = await evaluateMathWorker(expression)

        await message.reply(`\`${expression}\` = \`${resultString}\``)
    } catch (error) {
        logger.error(`Math.js Error: ${(error as Error).message}`)
        await message.reply(
            `❌ **Math.js Error:** \`${(error as Error).message}\``
        )
    }
}

async function handleTagCommand(
    message: Message,
    {
        tagManager,
        serverConfigManager
    }: Pick<MessageCreateServices, 'tagManager' | 'serverConfigManager'>
): Promise<void> {
    if (!message.guild) return // Tags are guild-specific

    const { content } = message
    const guildConfig = await serverConfigManager.getConfig(message.guild.id)
    if (!guildConfig.tagSystemEnabled) return

    // Tag creation
    if (content.startsWith('%=')) {
        const tagName = content.slice(2).split(' ')[0]
        if (!tagName) return

        const tagContent = content.slice(2 + tagName.length + 1)
        if (!tagContent) {
            await message.reply(
                '❌ Tag content cannot be empty.\n-# ❕ If you want an image as the tag, copy the link to the image.'
            )
            return
        }

        const hasPerms = await tagManager.canModerateTags(message)
        if (!hasPerms) {
            await message.reply(
                '❌ You do not have permission to moderate tags.'
            )
            return
        }

        if (await tagManager.getTag('discord', message.guild.id, tagName)) {
            await message.reply(
                `❌ A tag with the name "${tagName}" already exists.`
            )
            return
        }

        await tagManager.createTag(
            'discord',
            message.guild.id,
            tagName,
            tagContent,
            message.author.id
        )
        await message.reply(`✅ Tag ${tagName} created.`)
        return
    }

    // Tag deletion
    if (content.startsWith('%-')) {
        const tagName = content.slice(2).split(' ')[0]
        if (!tagName) return

        const hasPerms = await tagManager.canModerateTags(message)
        if (!hasPerms) {
            await message.reply(
                '❌ You do not have permission to moderate tags.'
            )
            return
        }

        const tag = await tagManager.getTag(
            'discord',
            message.guild.id,
            tagName
        )
        if (!tag) {
            await message.reply(`❌ Tag "${tagName}" not found.`)
            return
        }

        await tagManager.deleteTag('discord', message.guild.id, tagName)
        await message.reply(`✅ Tag ${tagName} deleted.`)
        return
    }

    // Tag retrieval
    const tagName = content.slice(1).split(' ')[0]
    if (!tagName) return

    const tag = await tagManager.getTag('discord', message.guild.id, tagName)
    if (!tag) {
        const allTags = await tagManager.listTags('discord', message.guild.id)
        if (allTags.length === 0) {
            await message.reply(`❌ Tag "${tagName}" not found.`)
            return
        }

        const suggestions = allTags
            .map(t => ({ name: t.name, dist: distance(tagName, t.name) }))
            .filter(t => t.dist < 3 && t.dist > 0)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 5)

        if (suggestions.length > 0) {
            const suggestionList = suggestions
                .map(s => `\`${s.name}\``)
                .join(', ')
            await message.reply(
                `❌ Tag "${tagName}" not found. Did you mean one of these?\n${suggestionList}`
            )
        } else {
            await message.reply(`❌ Tag "${tagName}" not found.`)
        }
        return
    }

    await message.reply(tag.content)
}

async function handleCrimsonChat(
    message: Message,
    {
        crimsonChat,
        markovBotManager
    }: Pick<MessageCreateServices, 'crimsonChat' | 'markovBotManager'>,
    client: Client<true>
): Promise<void> {
    if (markovBotManager.isChannelActive(message.channel.id)) return

    const isMainChannel = message.channel.id === '1335992675459141632'
    const isTestingServer = message.guildId === '1335971145014579263'
    const isMentioned = message.mentions.users.has(client.user.id)

    if (!isMainChannel && !isTestingServer && !isMentioned) return

    if (!crimsonChat.isEnabled() || crimsonChat.isIgnored(message.author.id)) {
        if (crimsonChat.isIgnored(message.author.id)) await message.react('❌')
        return
    }

    let { content } = message

    // Handle forwarded messages (Snapshots)
    if (message.messageSnapshots?.size > 0) {
        const forwardedMessages = (
            await Promise.all(
                Array.from(message.messageSnapshots.values()).map(
                    async snapshot => {
                        try {
                            if (snapshot.channelId && snapshot.id) {
                                const channel = await client.channels.fetch(
                                    snapshot.channelId
                                )
                                if (channel?.isTextBased()) {
                                    const fullMessage =
                                        await channel.messages.fetch(
                                            snapshot.id
                                        )
                                    return `[${fullMessage.author.username}]: ${fullMessage.content}`
                                }
                            }
                        } catch {
                            /* Fallback below */
                        }
                        return `[${snapshot.author!.username}]: ${snapshot.content}`
                    }
                )
            )
        ).join('\n')
        content += `\n< forwarded messages:\n${forwardedMessages}\n>`
    }

    // Get reply context
    const respondingTo = message.reference?.messageId
        ? {
              targetUsername: (
                  await message.channel.messages.fetch(
                      message.reference.messageId
                  )
              ).author.username,
              targetText: (
                  await message.channel.messages.fetch(
                      message.reference.messageId
                  )
              ).content
          }
        : undefined

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
        content += `\n< embed: ${JSON.stringify(message.embeds[0].toJSON())}>\``
    }

    // Parse Discord mentions into our required JSON format
    content = await parseMentions(client, content)

    crimsonChat.sendMessage(
        content,
        {
            messageContent: content,
            username: message.author.username,
            displayName:
                message.member?.displayName ?? message.author.displayName,
            serverDisplayName:
                message.member?.displayName ?? message.author.displayName,
            respondingTo,
            imageAttachments: Array.from(imageAttachments),
            targetChannel:
                isMentioned && !isMainChannel
                    ? (message.channel as TextChannel)
                    : undefined,
            guildName: message.guild?.name,
            channelName:
                message.channel instanceof TextChannel
                    ? message.channel.name
                    : undefined
        },
        message
    )
}

async function handleMarkovBot(
    message: Message,
    {
        markovBotManager,
        markovChat
    }: Pick<MessageCreateServices, 'markovBotManager' | 'markovChat'>
): Promise<void> {
    if (!markovBotManager.isChannelActive(message.channel.id)) return

    const instance = markovBotManager.getInstance(message.channel.id)
    if (!instance) return

    try {
        const { chainId, config } = instance
        const result = await markovChat.generateFromPersistentChain({
            chainId,
            words: config.words ?? 30,
            seed: message.content
        })

        if (result && result.text) {
            await message.reply(result.text)
        }

        // Continuous learning
        markovBotManager.train(message.channel.id, [
            {
                text: message.content,
                timestamp: message.createdTimestamp
            }
        ])
    } catch (error) {
        logger.error(`Error generating Markov response: ${error}`)
    }
}

export default async function onMessageCreate(
    client: Client<true>,
    services: MessageCreateServices
) {
    logger.info('Initializing messageCreate event handler...')
    const {
        tagManager,
        serverConfigManager,
        commandManager,
        crimsonChat,
        messageTrigger,
        antiRaidManager,
        markovBotManager,
        markovChat
    } = services

    client.on('messageCreate', async message => {
        // logger.info(`Received message: ${message.content}`)
        try {
            if (message.author.bot) return

            // Anti-raid check
            await antiRaidManager.checkMessage(message)

            const guildConfig = await serverConfigManager.getConfig(
                message.guild?.id
            )

            // Markov Bot
            await handleMarkovBot(message, { markovBotManager, markovChat })

            // Prefix commands
            if (message.content.startsWith(guildConfig.prefix)) {
                await commandManager.handleMessageCommand(
                    message,
                    guildConfig.prefix
                )
                return
            }

            // "%" commands (math and tags)
            if (message.content.startsWith('%')) {
                if (message.content.startsWith('% ')) {
                    logger.info('Handling math command...')
                    await handleMathCommand(message)
                } else {
                    logger.info('Handling tag command...')
                    await handleTagCommand(message, {
                        tagManager,
                        serverConfigManager
                    })
                }
                return
            }

            // QOTD
            await handleQOTD(message, { crimsonChat })

            // Message Triggers
            if (guildConfig.messageTrigger) {
                await messageTrigger.processMessage(message)
            }

            // CrimsonChat
            await handleCrimsonChat(
                message,
                { crimsonChat, markovBotManager },
                client
            )
        } catch (error) {
            logger.error(
                `Error in messageCreate event handler!\n${error instanceof Error ? (error.stack ?? error.message) : util.inspect(error)}`
            )
        }
    })
}
