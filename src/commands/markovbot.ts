import { SlashCommandBuilder, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js'
import { CommandContext } from '../modules'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('markovbot')
        .setDescription('Configure the Markov chatbot for a channel.')
        .addSubcommand(subcommand => subcommand
            .setName('on')
            .setDescription('Turn the Markov chatbot on for this channel.')
            .addUserOption(option => option
                .setName('user')
                .setDescription('Generate text in the style of a specific user.')
                .setRequired(false)
            ).addStringOption(option => option
                .setName('user_id')
                .setDescription('User ID to use if the user is not in the server.')
                .setRequired(false)
            ).addIntegerOption(option => option
                .setName('words')
                .setDescription('How many words to generate (default: 30).')
                .setRequired(false)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('off')
            .setDescription('Turn the Markov chatbot off for this channel.')
        ).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    async execute(ctx: CommandContext<true>) {
        if (!ctx.guild) {
            await ctx.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral })
            return
        }

        const subcommand = ctx.getSubcommand(true)
        const guildConfig = await ctx.guildConfigManager.getConfig(ctx.guild.id)
        const channelId = ctx.channel?.id

        if (!channelId || ![
            ChannelType.GuildText,
            ChannelType.PublicThread,
            ChannelType.PrivateThread
        ].includes(ctx.channel.type)) {
            await ctx.reply({ content: 'This command can only be used in a text channel or thread.', flags: MessageFlags.Ephemeral })
            return
        }

        const markovBotManager = ctx.markovBotManager

        if (subcommand === 'on') {
            if (!guildConfig.markovBotWhitelistedChannels.includes(channelId)) {
                await ctx.reply({ content: 'This channel is not whitelisted for the Markov bot. An admin can add it using `/config markovbot whitelist_add`.', flags: MessageFlags.Ephemeral })
                return
            }

            await ctx.deferReply({ flags: MessageFlags.Ephemeral })
            await ctx.editReply('Training Markov model for this channel... This may take a moment.')

            const user = await ctx.getUserOption('user')
            const userId = ctx.getStringOption('user_id')
            const words = ctx.getIntegerOption('words')

            try {
                await markovBotManager.activate(channelId, {
                    guild: ctx.guild,
                    channelId: channelId,
                    user: user ?? undefined,
                    userId: userId ?? undefined,
                    words: words ?? undefined
                })

                await ctx.editReply('✅ Markov bot has been turned on for this channel.')
            } catch (error) {
                await ctx.editReply(`❌ Failed to activate Markov bot: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`)
            }

        } else if (subcommand === 'off') {
            markovBotManager.deactivate(channelId)
            await ctx.reply({ content: '✅ Markov bot has been turned off for this channel.', flags: MessageFlags.Ephemeral })
        }
    }
} satisfies SlashCommand
