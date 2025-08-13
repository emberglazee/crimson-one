import { InteractionContextType, PermissionsBitField, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import GuildConfigManager from '../modules/GuildConfig'
import { boolToEmoji } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure the bot for your server')
        .addSubcommand(subcommand => subcommand
            .setName('prefix')
            .setDescription('Set the prefix for the bot')
            .addStringOption(option => option
                .setName('prefix')
                .setDescription('The prefix for the bot')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('message-trigger')
            .setDescription('Toggle the message trigger feature')
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Whether to enable the message trigger feature')
                .setRequired(true)
            )
        ).addSubcommand(subcommand => subcommand
            .setName('get')
            .setDescription('Get the current config for the server')
        ).setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    async execute(context) {
        if (!context.guild || !context.member) {
            await context.reply('This command can only be used in a server.')
            return
        }

        const subcommand = context.getSubcommand(true)

        if (subcommand !== 'get' && !context.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            await context.reply('❌ You need the `Manage Server` permission to use this command.')
            return
        }

        await context.deferReply()

        const guildConfigManager = GuildConfigManager.getInstance()
        const guildId = context.guild.id

        if (subcommand === 'prefix') {

            const prefix = context.getStringOption('prefix', true)
            const guildConfig = await guildConfigManager.getConfig(guildId)
            guildConfig.prefix = prefix
            await guildConfigManager.setConfig(guildId, guildConfig)
            await context.editReply(`✅ Prefix changed to \`${prefix}\``)

        } else if (subcommand === 'message-trigger') {

            const enabled = context.getBooleanOption('enabled', true)
            const guildConfig = await guildConfigManager.getConfig(guildId)
            guildConfig.messageTrigger = enabled
            await guildConfigManager.setConfig(guildId, guildConfig)
            await context.editReply(`${boolToEmoji(enabled)} Message trigger has been set to: ${enabled}`)

        } else if (subcommand === 'get') {

            const guildConfig = await guildConfigManager.getConfig(guildId)
            await context.editReply(
                `Current config for **${context.guild.name}**:\n` +
                `- Prefix: \`${guildConfig.prefix}\`\n` +
                `- Message trigger: ${boolToEmoji(guildConfig.messageTrigger)}`
            )

        }
    }
} satisfies SlashCommand
