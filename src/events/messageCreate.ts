import { Logger, TagManager, GuildConfigManager, CommandManager, CrimsonChat, MessageTrigger, AntiRaidManager, MarkovBotManager, MarkovChat } from '../modules'
const logger = new Logger('event.messageCreate')
import { type Client, TextChannel, Message } from 'discord.js'
import { normalizeUrl } from '../modules/CrimsonChat/util/url-utils'
import { parseMentions } from '../modules/CrimsonChat/util/formatters'
import { create, all, type MathJsInstance } from 'mathjs'
import { toFeetInches } from '../util/functions'
import util from 'util'
import { QOTD_ANSWERS_CHANNEL_ID, QOTD_CHANNEL_ID, QOTD_ROLE_ID, SOLITARY_CONFINEMENT_GUILD_ID } from '../util/constants'


interface MessageCreateServices {
    tagManager: TagManager
    guildConfigManager: GuildConfigManager
    commandManager: CommandManager
    crimsonChat: CrimsonChat
    messageTrigger: MessageTrigger
    antiRaidManager: AntiRaidManager
    markovBotManager: MarkovBotManager
    markovChat: MarkovChat
}

async function handleQOTD(message: Message, { crimsonChat }: Pick<MessageCreateServices, 'crimsonChat'>): Promise<void> {
    if (message.guildId !== SOLITARY_CONFINEMENT_GUILD_ID || message.channelId !== QOTD_CHANNEL_ID) {
        return
    }

    if (!message.mentions.roles.has(QOTD_ROLE_ID)) {
        return
    }

    const botMember = message.guild?.members.me
    if (!botMember?.roles.cache.has(QOTD_ROLE_ID)) {
        return
    }

    const answersChannel = await message.client.channels.fetch(QOTD_ANSWERS_CHANNEL_ID).catch(() => null) as TextChannel | null
    if (!answersChannel) {
        logger.warn(`QOTD answers channel with ID ${QOTD_ANSWERS_CHANNEL_ID} not found.`)
        return
    }

    const forwardedMessage = await answersChannel.send({
        content: `> ${message.author.toString()} in ${message.channel.toString()} asked:\n${message.content}`,
        allowedMentions: { users: [] }
    })

    crimsonChat.sendMessage(message.content, {
        messageContent: message.content,
        username: message.author.username,
        displayName: message.member?.displayName ?? message.author.displayName,
        serverDisplayName: message.member?.displayName ?? message.author.displayName,
        guildName: message.guild?.name,
        channelName: answersChannel.name,
        targetChannel: answersChannel
    }, forwardedMessage)
}

async function handleMathCommand(message: Message, math: MathJsInstance): Promise<void> {
    const expression = message.content.slice(2).trim()
    if (!expression) return

    try {
        const result = math.evaluate(expression, { toFeetInches })

        let resultString = ''
        if ((typeof result === 'object' || typeof result === 'function') && result !== null && result.toString) {
            resultString = result.toString()
        } else {
            resultString = String(result)
        }

        if (expression.replace(/\s+/g, '') === '9+10') {
            resultString = '21'
        }

        if (resultString.length > 1900) {
            resultString = resultString.substring(0, 1900) + '... (result truncated)'
        }

        await message.reply(`\`${expression}\` = \`${resultString}\``)
    } catch (error) {
        await message.reply(`❌ **Math.js Error:** \`${(error as Error).message}\``)
    }
}

async function handleTagCommand(message: Message, { tagManager, guildConfigManager }: Pick<MessageCreateServices, 'tagManager' | 'guildConfigManager'>): Promise<void> {
    if (!message.guild) return // Tags are guild-specific

    const { content } = message
    const guildConfig = await guildConfigManager.getConfig(message.guild.id)
    if (!guildConfig.tagSystemEnabled) return

    // Tag creation
    if (content.startsWith('%=')) {
        const tagName = content.slice(2).split(' ')[0]
        if (!tagName) return

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

        if (await tagManager.getTag(message.guild.id, tagName)) {
            await message.reply(`❌ A tag with the name "${tagName}" already exists.`)
            return
        }

        await tagManager.createTag(message.guild.id, tagName, tagContent, message.author.id)
        await message.reply(`✅ Tag ${tagName} created.`)
        return
    }

    // Tag deletion
    if (content.startsWith('%-')) {
        const tagName = content.slice(2).split(' ')[0]
        if (!tagName) return

        const hasPerms = await tagManager.canModerateTags(message)
        if (!hasPerms) {
            await message.reply('❌ You do not have permission to moderate tags.')
            return
        }

        const tag = await tagManager.getTag(message.guild.id, tagName)
        if (!tag) {
            await message.reply(`❌ Tag "${tagName}" not found.`)
            return
        }

        await tagManager.deleteTag(message.guild.id, tagName)
        await message.reply(`✅ Tag ${tagName} deleted.`)
        return
    }

    // Tag retrieval
    const tagName = content.slice(1).split(' ')[0]
    if (!tagName) return

    const tag = await tagManager.getTag(message.guild.id, tagName)
    if (!tag) {
        await message.reply(`❌ Tag ${tagName} not found.`)
        return
    }

    await message.reply(tag.content)
}

async function handleCrimsonChat(message: Message, { crimsonChat, markovBotManager }: Pick<MessageCreateServices, 'crimsonChat' | 'markovBotManager'>, client: Client<true>): Promise<void> {
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
        content += `\n< embed: ${JSON.stringify(message.embeds[0].toJSON())}>\``
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

async function handleMarkovBot(message: Message, { markovBotManager, markovChat }: Pick<MessageCreateServices, 'markovBotManager' | 'markovChat'>): Promise<void> {
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
        markovBotManager.train(message.channel.id, [{
            text: message.content,
            timestamp: message.createdTimestamp
        }])

    } catch (error) {
        logger.error(`Error generating Markov response: ${error}`)
    }
}

export default async function onMessageCreate(client: Client<true>, services: MessageCreateServices) {
    const { tagManager, guildConfigManager, commandManager, crimsonChat, messageTrigger, antiRaidManager, markovBotManager, markovChat } = services

    const math = create(all)
    math.createUnit({
        embil: { baseName: 'length', definition: '165 cm', aliases: ['embi_length', 'embi_height'] },
        embim: { baseName: 'mass', definition: '50 kg', aliases: ['embi_weight', 'embi_mass'] },
        ly: { baseName: 'length', definition: '9460730472580.8 km', aliases: ['light_year'] },
        au: { baseName: 'length', definition: '149597870.69 km', aliases: ['astronomical_unit'] },
        c0: { baseName: 'length', definition: '299792458 m/s', aliases: ['light_speed'] }
    }, { override: true, prefixes: 'long' })

    client.on('messageCreate', async message => {
        try {
            if (message.author.bot) return

            // Anti-raid check
            await antiRaidManager.checkMessage(message)

            const guildConfig = await guildConfigManager.getConfig(message.guild?.id)

            // Markov Bot
            await handleMarkovBot(message, { markovBotManager, markovChat })

            // Prefix commands
            if (message.content.startsWith(guildConfig.prefix)) {
                await commandManager.handleMessageCommand(message, guildConfig.prefix)
                return
            }

            // "%" commands (math and tags)
            if (message.content.startsWith('%')) {
                if (message.content.startsWith('% ')) {
                    await handleMathCommand(message, math)
                } else {
                    await handleTagCommand(message, { tagManager, guildConfigManager })
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
            await handleCrimsonChat(message, { crimsonChat, markovBotManager }, client)

        } catch (error) {
            logger.error(`Error in messageCreate event handler!\n${error instanceof Error ? error.stack ?? error.message : util.inspect(error)}`)
        }
    })
}
