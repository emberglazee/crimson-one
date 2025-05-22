import { Logger, red, yellow } from '../util/logger'
const logger = new Logger('/markov')

import { ChannelType, SlashCommandBuilder, TextChannel, EmbedBuilder, Message } from 'discord.js'

import { formatTimeRemaining } from '../util/functions'
import { SlashCommand } from '../types/types'
import { MarkovChat } from '../modules/MarkovChain/MarkovChat'
import { DataSource } from '../modules/MarkovChain/DataSource'
import type { CommandContext } from '../modules/CommandManager'

// Discord interaction tokens expire after 15 minutes
const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes in milliseconds
const SAFETY_MARGIN_MS = 1 * 60 * 1000 // Switch to new message 1 minute before expiry (at 14 minutes)

// Helper interface to manage message updates
interface MessageUpdater {
    updateMessage(content: string): Promise<void>
}

// Class to handle message updating with fallback support
class InteractionMessageManager implements MessageUpdater {
    private context: CommandContext
    private followUpMessagePromise: Promise<Message | null> | null = null
    private followUpMessage: Message | null = null
    private useFollowUp = false

    constructor(context: CommandContext) {
        this.context = context
    }

    // Switch to using follow-up message
    public switchToFollowUp(): void {
        if (this.useFollowUp) return
        this.useFollowUp = true
        this.followUpMessagePromise = this.createFollowUpMessage()
    }

    private async createFollowUpMessage(): Promise<Message | null> {
        try {
            // First update the original message to inform users
            await this.context.editReply(
                `⏳ Operation in progress...\n` +
                `⚠️ *This is taking longer than 14 minutes. Real-time updates will continue in a follow-up message.*`
            ).catch((err: Error) => {
                logger.warn(`Failed to update original message about timeout: ${red(err.message)}`)
            })

            // Create a follow-up message that we'll update from now on
            const followUp = await this.context.followUp('🔄 Continuing operation...\nUpdates will now appear in this message.')

            // If followUp returns void (text command), just return null
            if (!followUp || typeof followUp !== 'object' || !('edit' in followUp)) {
                logger.warn('Follow-up message could not be created (likely a text command).')
                return null
            }

            this.followUpMessage = followUp as Message
            logger.ok(`Created follow-up message with ID ${yellow((followUp as Message).id)}`)
            return followUp as Message
        } catch (error) {
            logger.warn(`Failed to create follow-up message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            return null
        }
    }

    public async updateMessage(content: string): Promise<void> {
        try {
            if (this.useFollowUp) {
                // Make sure we have a follow-up message
                if (this.followUpMessagePromise && !this.followUpMessage) {
                    this.followUpMessage = await this.followUpMessagePromise
                }

                if (this.followUpMessage) {
                    await this.followUpMessage.edit(content)
                } else {
                    // Fallback if follow-up message creation failed (e.g., text command)
                    await this.context.editReply(content).catch(() => {})
                }
            } else {
                await this.context.editReply(content)
            }
        } catch (error) {
            logger.warn(`Failed to update message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
        }
    }

    public get isUsingFollowUp(): boolean {
        return this.useFollowUp
    }

    public async sendFinalMessage(options: { content?: string; embeds?: EmbedBuilder[] }): Promise<void> {
        try {
            if (this.useFollowUp && this.followUpMessage) {
                await this.followUpMessage.edit(options)
            } else {
                await this.context.editReply(options)
            }
        } catch (error) {
            // If both methods fail, try to send a new follow-up message with the results
            logger.warn(`Failed to send final message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            try {
                await this.context.followUp({
                    ...options
                })
            } catch (finalError) {
                logger.error(`Failed to send any completion message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`)
            }
        }
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('markov')
        .setDescription('Generate text using Markov chains trained on chat messages')
        .addSubcommand(sc => sc
            .setName('generate')
            .setDescription('Create a new message based on collected chat data')
            .addStringOption(so => so
                .setName('source')
                .setDescription('Where to get messages from for generation')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 This entire server', value: 'guild' },
                    { name: '🌐 Global (all servers)', value: 'global' }
                )
            ).addChannelOption(co => co
                .setName('channel')
                .setDescription('Specific channel to use for message generation')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('Generate text in the style of a specific user')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(io => io
                .setName('words')
                .setDescription('How many words to generate (default: 20)')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('seed')
                .setDescription('Start the generated text with specific words')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('character_mode')
                .setDescription('Generate text character by character (cursed, for maximum chaos)')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('info')
            .setDescription('View statistics about available message data')
            .addStringOption(so => so
                .setName('source')
                .setDescription('Where to get message statistics from')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 This entire server', value: 'guild' },
                    { name: '🌐 Global (all servers)', value: 'global' }
                )
            ).addChannelOption(co => co
                .setName('channel')
                .setDescription('Specific channel to view statistics for')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('View statistics for a specific user\'s messages')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('collect')
            .setDescription('Gather messages to train the Markov chain')
            .addChannelOption(co => co
                .setName('channel')
                .setDescription('Channel to collect messages from')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread)
            ).addUserOption(uo => uo
                .setName('user')
                .setDescription('Only collect messages from this user')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(io => io
                .setName('limit')
                .setDescription('Maximum number of messages to collect (default: 1000)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('entire_channel')
                .setDescription('Collect every message from the channel (ignores limit)')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('collect_all')
            .setDescription('Collect messages from every text channel and thread in the server')
            .addUserOption(uo => uo
                .setName('user')
                .setDescription('Only collect messages from this user')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server')
                .setRequired(false)
            ).addIntegerOption(io => io
                .setName('limit')
                .setDescription('Maximum number of messages to collect per channel (default: 1000)')
                .setRequired(false)
            ).addBooleanOption(bo => bo
                .setName('entire_channel')
                .setDescription('Collect every message from every channel (ignores limit)')
                .setRequired(false)
            )
        ),

    async execute(context: CommandContext) {
        if (!context.guild) {
            logger.info('Command used outside of a server');
            await context.reply('❌ This command can only be used in a server');
            return;
        }

        const subcommand = context.getSubcommand(true); // Ensure subcommand is present
        const markov = MarkovChat.getInstance();
        const dataSource = DataSource.getInstance();

        // Helper to resolve user from picker or user_id, used by subcommand handlers
        async function _resolveUserOrId(ctx: CommandContext) {
            const user = await ctx.getUserOption('user') ?? undefined;
            const userId = await ctx.getStringOption('user_id') ?? undefined;
            if (user) return user;
            if (userId) {
                try {
                    return await ctx.client.users.fetch(userId);
                } catch {
                    return { id: userId }; // Return as ID object for filtering
                }
            }
            return undefined;
        }

        switch (subcommand) {
            case 'generate':
                await _handleGenerateSubcommand(context, markov, _resolveUserOrId);
                break;
            case 'info':
                await _handleInfoSubcommand(context, markov, _resolveUserOrId);
                break;
            case 'collect':
                await _handleCollectSubcommand(context, markov, dataSource, _resolveUserOrId);
                break;
            case 'collect_all':
                await _handleCollectAllSubcommand(context, markov, _resolveUserOrId);
                break;
            default:
                logger.warn(`Unknown subcommand received: ${subcommand}`);
                await context.reply(`❌ Unknown subcommand: ${subcommand}`);
        }
    }
} satisfies SlashCommand;

type Source = 'guild' | 'global' | null;

// --- Subcommand Handler Implementations ---

async function _handleGenerateSubcommand(context: CommandContext, markov: MarkovChat, resolveUserOrId: (ctx: CommandContext) => ReturnType<typeof resolveUserOrIdInternal>) {
    if (!context.guild) return; // Should be guaranteed by main execute, but good practice

    const userOrId = await resolveUserOrId(context);
    const user = userOrId && 'tag' in userOrId ? userOrId : undefined;
    const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined;
    const source = (await context.getStringOption('source')) as Source;
    const channel = source === null ? (await context.getChannelOption('channel')) as TextChannel | null ?? undefined : undefined;
    const words = await context.getIntegerOption('words') ?? 20;
    const seed = await context.getStringOption('seed') ?? undefined;
    const characterMode = await context.getBooleanOption('character_mode', false);

    await context.deferReply();

    try {
        logger.info(`Generating message with source: ${yellow(source)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}, words: ${yellow(words)}, seed: ${yellow(seed)}`);
        const timeStart = process.hrtime();
        const messageManager = new InteractionMessageManager(context);
        const interactionStartTime = process.hrtime();
        let lastUpdateTime = 0;
        let lastStep = '';
        const UPDATE_INTERVAL = 5000;

        markov.on('generateProgress', async progress => {
            const now = process.hrtime(interactionStartTime);
            const nowMs = now[0] * 1000 + now[1] / 1e6;
            const stepChanged = progress.step !== lastStep;
            if (!stepChanged && nowMs - lastUpdateTime < UPDATE_INTERVAL) return;

            lastUpdateTime = nowMs;
            lastStep = progress.step;

            if (nowMs > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
                logger.info(`Approaching interaction timeout (${yellow(nowMs)}ms elapsed). Switching to follow-up message.`);
                messageManager.switchToFollowUp();
            }

            let progressMessage = `⏳ Generating message...\n📊 Step: ${progress.step}\n`;
            if (progress.step === 'training') {
                const percent = ((progress.progress / progress.total) * 100).toFixed(1);
                progressMessage += `🔄 Training: ${progress.progress}/${progress.total} messages (${percent}%)\n`;
            }
            progressMessage += `⌛ Elapsed: ${formatTimeRemaining(progress.elapsedTime / 1000)}\n`;
            if (progress.estimatedTimeRemaining !== null) {
                progressMessage += `⏱️ ETA: ${formatTimeRemaining(progress.estimatedTimeRemaining)}`;
            }
            await messageManager.updateMessage(progressMessage);
        });

        const result = await markov.generateMessage({
            guild: source === 'guild' ? context.guild : undefined,
            channel: channel,
            user: user,
            userId: userId,
            words,
            seed,
            global: source === 'global',
            characterMode: characterMode ?? undefined
        });
        markov.removeAllListeners('generateProgress');

        const timeEnd = process.hrtime(timeStart);
        const timeEndMs = timeEnd[0] * 1000 + timeEnd[1] / 1e6;
        logger.ok(`Generated message: ${yellow(result)}`);
        await messageManager.sendFinalMessage({
            content: `${result}\n` +
            `-# - Generated in ${timeEndMs.toFixed(0)}ms\n` +
            `-# - Filters: ${[
                source === 'global' ? 'Global' : 'This server',
                channel ? `Channel: #${channel.name ?? channel.id}` : null,
                user ? `User: @${user.tag}` : userId ? `User ID: ${userId}` : null,
                words !== 20 ? (characterMode ? `Characters: ${words}` : `Words: ${words}`) : null,
                seed ? `Seed: "${seed}"` : null,
                characterMode ? 'Mode: Character-by-character (cursed)' : null
            ].filter(Boolean).join(', ') || 'None'}`
        });
    } catch (error) {
        markov.removeAllListeners('generateProgress');
        logger.warn(`Failed to generate message: ${red(error instanceof Error ? error.message : 'Unknown error')}`);
        await context.editReply({ content: `❌ Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
}

async function _handleInfoSubcommand(context: CommandContext, markov: MarkovChat, resolveUserOrId: (ctx: CommandContext) => ReturnType<typeof resolveUserOrIdInternal>) {
    if (!context.guild) return;

    const userOrId = await resolveUserOrId(context);
    const user = userOrId && 'tag' in userOrId ? userOrId : undefined;
    const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined;
    const source = (await context.getStringOption('source')) as Source;
    const channel = source === null ? (await context.getChannelOption('channel')) as TextChannel | null ?? undefined : undefined;

    await context.deferReply();

    try {
        logger.info(`Getting Markov info with source: ${yellow(source)}, user: ${yellow(user?.tag ?? userId)}, channel: ${yellow(channel?.name)}`);
        const timeStart = process.hrtime();
        const messageManager = new InteractionMessageManager(context);
        const interactionStartTime = process.hrtime();
        let lastUpdateTime = 0;
        let lastStep = '';
        const UPDATE_INTERVAL = 5000;

        markov.on('infoProgress', async progress => {
            const now = process.hrtime(interactionStartTime);
            const nowMs = now[0] * 1000 + now[1] / 1e6;
            const stepChanged = progress.step !== lastStep;
            if (!stepChanged && nowMs - lastUpdateTime < UPDATE_INTERVAL) return;

            lastUpdateTime = nowMs;
            lastStep = progress.step;

            if (nowMs > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
                logger.info(`Approaching interaction timeout (${yellow(nowMs)}ms elapsed). Switching to follow-up message.`);
                messageManager.switchToFollowUp();
            }

            let progressMessage = `⏳ Gathering statistics...\n📊 Step: ${progress.step}\n`;
            if (progress.step === 'processing') {
                const percent = ((progress.progress / progress.total) * 100).toFixed(1);
                progressMessage += `🔄 Processing: ${progress.progress}/${progress.total} messages (${percent}%)\n`;
            }
            progressMessage += `⌛ Elapsed: ${formatTimeRemaining(progress.elapsedTime / 1000)}\n`;
            if (progress.estimatedTimeRemaining !== null) {
                progressMessage += `⏱️ ETA: ${formatTimeRemaining(progress.estimatedTimeRemaining)}`;
            }
            await messageManager.updateMessage(progressMessage);
        });

        const stats = await markov.getMessageStats({
            guild: source === 'guild' ? context.guild : undefined,
            channel: !source ? channel : undefined,
            user: user,
            userId: userId,
            global: source === 'global'
        });
        markov.removeAllListeners('infoProgress');

        const timeEnd = process.hrtime(timeStart);
        const timeEndMs = timeEnd[0] * 1000 + timeEnd[1] / 1e6;
        const oldestDate = stats.oldestMessageTimestamp ? new Date(stats.oldestMessageTimestamp).toLocaleString() : 'N/A';
        const newestDate = stats.newestMessageTimestamp ? new Date(stats.newestMessageTimestamp).toLocaleString() : 'N/A';

        const embed = new EmbedBuilder()
            .setTitle('Markov Chain Data Statistics')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Messages', value: stats.messageCount.toLocaleString(), inline: true },
                { name: 'Unique Authors', value: stats.authorCount.toLocaleString(), inline: true },
                { name: 'Channels', value: stats.channelCount.toLocaleString(), inline: true },
                { name: 'Total Words', value: stats.totalWordCount.toLocaleString(), inline: true },
                { name: 'Unique Words', value: stats.uniqueWordCount.toLocaleString(), inline: true },
                { name: 'Words Per Message', value: stats.avgWordsPerMessage.toFixed(1), inline: true },
                { name: 'Oldest Message', value: oldestDate, inline: false },
                { name: 'Newest Message', value: newestDate, inline: false },
            )
            .setFooter({ text: `Generated in ${timeEndMs.toFixed(0)}ms` })
            .setTimestamp()
            .setDescription(
                `**Filters Applied:**\n${[
                    source === 'global' ? '🌐 Global' : !source && channel ? `📝 Channel: #${channel.name}` : '🏠 This server',
                    user ? `👤 User: @${user.tag}` : userId ? `👤 User ID: ${userId}` : null
                ].filter(Boolean).join('\n')}`
            );

        logger.ok(`Generated Markov info in ${yellow(timeEndMs.toFixed(0))}ms`);
        await messageManager.sendFinalMessage({ content: '', embeds: [embed] });
    } catch (error) {
        markov.removeAllListeners('infoProgress');
        logger.warn(`Failed to get Markov info: ${red(error instanceof Error ? error.message : 'Unknown error')}`);
        await context.editReply({ content: `❌ Failed to get Markov info: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
}

async function _handleCollectSubcommand(context: CommandContext, markov: MarkovChat, dataSource: DataSource, resolveUserOrId: (ctx: CommandContext) => ReturnType<typeof resolveUserOrIdInternal>) {
    if (!context.guild) return;

    const userOrId = await resolveUserOrId(context);
    const user = userOrId && 'tag' in userOrId ? userOrId : undefined;
    const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined;
    const collectEntireChannel = await context.getBooleanOption('entire_channel', false);
    const limit = collectEntireChannel ? 'entire' : (await context.getIntegerOption('limit'));
    const channel = (await context.getChannelOption('channel', true)) as TextChannel; // Required true

    const wasFullyCollected = await dataSource.isChannelFullyCollected(context.guild.id, channel.id);
    let replyContent = `🔍 Starting to collect ${collectEntireChannel ? 'ALL' : limit} messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}...`;
    if (wasFullyCollected) {
        replyContent += `\n⚠️ This channel was already fully collected before. Only collecting new messages since the last collection.`;
    }
    if (collectEntireChannel) {
        replyContent += `\n💡 Using Discord User API to fetch the total message count.`;
    }
    await context.reply(replyContent);

    try {
        logger.info(`Collecting messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : userId ? ` by user ID ${userId}` : ''}, limit: ${yellow(limit)}, wasFullyCollected: ${yellow(!!wasFullyCollected)}`);
        let totalMessageCount: number | null | undefined = null;
        let percentCompleteEmoji = '⏳';
        const interactionStartTime = process.hrtime();
        const messageManager = new InteractionMessageManager(context);

        markov.on('collectProgress', async progress => {
            if (progress.batchNumber % 10 === 0 || progress.batchNumber === 1) {
                logger.ok(`Progress update: ${yellow(progress.batchNumber)} batches, ${yellow(progress.totalCollected)}/${yellow(progress.limit === 'entire' ? 'ALL' : progress.limit)} messages (${yellow(progress.limit === 'entire' ? '...' : progress.percentComplete.toFixed(1) + '%' )})`);
                const elapsedSinceInteractionArr = process.hrtime(interactionStartTime);
                const elapsedSinceInteraction = elapsedSinceInteractionArr[0] * 1000 + elapsedSinceInteractionArr[1] / 1e6;

                if (elapsedSinceInteraction > (INTERACTION_TIMEOUT_MS - SAFETY_MARGIN_MS) && !messageManager.isUsingFollowUp) {
                    logger.info(`Approaching interaction timeout (${yellow(elapsedSinceInteraction)}ms elapsed). Switching to follow-up message.`);
                    messageManager.switchToFollowUp();
                }

                if (progress.percentComplete > 0) {
                    if (progress.percentComplete < 25) percentCompleteEmoji = '🟢';
                    else if (progress.percentComplete < 50) percentCompleteEmoji = '🟡';
                    else if (progress.percentComplete < 75) percentCompleteEmoji = '🟠';
                    else percentCompleteEmoji = '🔴';
                }

                let progressMessage = `⏳ Collecting messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}...\n`;
                if (progress.limit === 'entire' && progress.percentComplete > 0) {
                    progressMessage += `${percentCompleteEmoji} Progress: ${progress.totalCollected} messages collected (${progress.percentComplete.toFixed(1)}% complete)\n`;
                } else if (progress.limit === 'entire') {
                    progressMessage += `${percentCompleteEmoji} Progress: ${progress.totalCollected} messages collected\n`;
                } else {
                    progressMessage += `${percentCompleteEmoji} Progress: ${progress.totalCollected}/${progress.limit} messages (${progress.percentComplete.toFixed(1)}%)\n`;
                }
                if (progress.estimatedTimeRemaining !== null) {
                    progressMessage += `⏱️ ETA: ${formatTimeRemaining(progress.estimatedTimeRemaining)} (${progress.messagesPerSecond.toFixed(1)} msgs/sec)\n`;
                    progressMessage += `⌛ Elapsed: ${formatTimeRemaining(progress.elapsedTime / 1000)}\n`;
                }
                progressMessage += `📚 Batches processed: ${progress.batchNumber}`;
                if (wasFullyCollected) progressMessage += `\n⚠️ Only collecting new messages since last collection.`;
                await messageManager.updateMessage(progressMessage);
            }
        });

        markov.on('collectComplete', result => {
            totalMessageCount = result.totalMessageCount;
            logger.ok(`Collection complete. ${yellow(result.totalCollected)} messages collected${totalMessageCount ? ` out of ${yellow(totalMessageCount)} total` : ''}.`);
        });

        const count = await markov.collectMessages(channel, {
            user,
            userId,
            limit: limit === null ? undefined : limit,
        });
        markov.removeAllListeners('collectProgress');
        markov.removeAllListeners('collectComplete');

        logger.ok(`Collected ${yellow(count)} messages from ${yellow(channel)}${user ? ` by ${yellow(user.tag)}` : userId ? ` by user ID ${userId}` : ''}`);
        let completionMessage = `✅ Successfully collected ${count} messages from ${channel}${user ? ` by ${user}` : userId ? ` by user ID ${userId}` : ''}\n`;
        if (totalMessageCount && collectEntireChannel) {
            const percentageCollected = ((count / totalMessageCount) * 100).toFixed(1);
            completionMessage += `📊 ${count} valid messages out of ${totalMessageCount} total messages in the channel (${percentageCollected}%)\n`;
        }
        if (wasFullyCollected) { // Check the boolean value directly
            completionMessage += `📋 These were new messages since the previous collection.`;
        } else if (collectEntireChannel) {
            completionMessage += `📋 The entire channel has been marked as fully collected.`;
        }
        await messageManager.sendFinalMessage({ content: completionMessage });
    } catch (error) {
        markov.removeAllListeners('collectProgress');
        markov.removeAllListeners('collectComplete');
        logger.warn(`Failed to collect messages: ${red(error instanceof Error ? error.message : 'Unknown error')}`);
        try {
            await context.editReply(`❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } catch (replyError) {
            logger.warn(`Failed to edit reply with error message: ${red(replyError instanceof Error ? replyError.message : 'Unknown error')}`);
            try {
                await context.followUp(`❌ Failed to collect messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
            } catch (finalError) {
                logger.error(`Failed to send any error message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`);
            }
        }
    }
}

async function _handleCollectAllSubcommand(context: CommandContext, markov: MarkovChat, resolveUserOrId: (ctx: CommandContext) => ReturnType<typeof resolveUserOrIdInternal>) {
    if (!context.guild) return;

    const userOrId = await resolveUserOrId(context);
    const user = userOrId && 'tag' in userOrId ? userOrId : undefined;
    const userId = userOrId && !('tag' in userOrId) ? userOrId.id : undefined;
    const collectEntireChannel = await context.getBooleanOption('entire_channel', false);
    const limit = collectEntireChannel ? 'entire' : (await context.getIntegerOption('limit'));

    await context.deferReply();
    logger.info(`{collect_all} Collecting from every channel`);

    const textChannels = (await context.guild.channels.fetch())
        .filter(c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.viewable) as Map<string, TextChannel>;
    logger.ok(`{collect_all} Fetched ${yellow(textChannels.size)} text channels`);

    const threadPromises = [...textChannels.values()].map(async c => {
        try {
            const threads = await c.threads.fetch();
            return threads.threads.filter(t => t.viewable);
        } catch { return []; }
    });
    const threads = (await Promise.all(threadPromises)).flatMap(t => [...t.values()]);
    logger.ok(`{collect_all} Fetched ${yellow(threads.length)} threads`);

    const allTargets = [...textChannels.values(), ...threads];
    logger.info(`{collect_all} ${yellow(textChannels.size)} + ${yellow(threads.length)} = ${yellow(allTargets.length)} total collection targets`);

    await context.editReply(`📡 Starting collection from **${allTargets.length} channels and threads**... This may take a while.`);
    let collectedCountTotal = 0;
    let failedCount = 0;

    for await (const targetChannel of allTargets) {
        try {
            logger.info(`Collecting from #${yellow(targetChannel.name)} (${yellow(targetChannel.id)})`);
            const count = await markov.collectMessages(targetChannel as TextChannel, {
                user,
                userId,
                limit: limit === null ? undefined : limit,
                disableUserApiLookup: true // Avoid API spam for total count on each channel
            });
            collectedCountTotal += count;
            logger.ok(`Collected ${yellow(count)} messages from #${yellow(targetChannel.name)}`);
            await context.editReply(`📡 Collecting from ${allTargets.length} channels/threads... Processed #${targetChannel.name}. Total collected so far: ${collectedCountTotal}. Failures: ${failedCount}.`);
        } catch (err) {
            failedCount++;
            logger.warn(`Failed to collect from #${yellow(targetChannel.name)}: ${red(err instanceof Error ? err.message : err)}`);
            await context.editReply(`📡 Collecting from ${allTargets.length} channels/threads... Error processing #${targetChannel.name}. Total collected so far: ${collectedCountTotal}. Failures: ${failedCount}.`).catch(()=>{});
        }
    }

    await context.followUp(`✅ Finished collecting from all ${allTargets.length} channels and threads. Total messages collected: ${collectedCountTotal}. Failed channels: ${failedCount}.`);
}


// To satisfy the type checker for resolveUserOrId, since its actual implementation is inside the main execute
// We define its expected signature here for the helper functions.
// The actual `resolveUserOrId` defined in `execute` matches this.
async function resolveUserOrIdInternal(ctx: CommandContext): Promise<({ id: string } | import('discord.js').User) | undefined> {
    // This is just a stub for type checking, the real one is in execute
    const user = await ctx.getUserOption('user') ?? undefined;
    const userId = await ctx.getStringOption('user_id') ?? undefined;
    if (user) return user;
    if (userId) {
        try {
            return await ctx.client.users.fetch(userId);
        } catch {
            return { id: userId };
        }
    }
    return undefined;
}
