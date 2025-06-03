import { PermissionsBitField, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import GuildConfigManager from '../modules/GuildConfig'
import { boolToEmoji } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure the bot for your server')
        .addSubcommand(sc => sc
            .setName('prefix')
            .setDescription('Set the prefix for the bot')
            .addStringOption(so => so
                .setName('prefix')
                .setDescription('The prefix for the bot')
                .setRequired(true)
            )
        ).addSubcommand(sc => sc
            .setName('message-trigger')
            .setDescription('Toggle the message trigger feature')
            .addBooleanOption(bo => bo
                .setName('enabled')
                .setDescription('Whether to enable the message trigger feature')
                .setRequired(true)
            )
        ).addSubcommand(sc => sc
            .setName('get')
            .setDescription('Get the current config for the server')
        ),
    async execute(context) {
        if (!context.guild) {
            await context.editReply('This command can only be used in a server')
            return
        }
        await context.deferReply()
        const subcommand = context.getSubcommand()
        if (!subcommand) {
            await context.editReply('No subcommand provided')
            return
        }

        if (subcommand !== 'get' && !context.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            await context.editReply('❌ You need the `Manage Server` permission to use this command')
            return
        }


        if (subcommand === 'prefix') {
            await context.deferReply()
            const prefix = context.getStringOption('prefix')
            if (!prefix) {
                await context.editReply('❌ You must provide a prefix')
                return
            }
            const guildConfig = await GuildConfigManager.getInstance().getConfig(context.guild!.id)
            guildConfig.prefix = prefix
            await GuildConfigManager.getInstance().setConfig(context.guild!.id, guildConfig)
            await context.editReply(`✅ Prefix changed to ${prefix}`)
        }
        if (subcommand === 'message-trigger') {
            const enabled = context.getBooleanOption('enabled')
            if (enabled === null) {
                await context.editReply('❌ You must provide a boolean value')
                return
            }
            await GuildConfigManager.getInstance().setConfig(context.guild.id, { messageTrigger: enabled })
            await context.editReply(`${boolToEmoji(enabled)} Message trigger set to ${enabled}`)
        }
        if (subcommand === 'get') {
            const guildConfig = await GuildConfigManager.getInstance().getConfig(context.guild.id)
            await context.editReply(`Current config for ${context.guild.name}:\n- Prefix: ${guildConfig.prefix}\n- Message trigger: ${boolToEmoji(guildConfig.messageTrigger)}`)
        }
    }
} satisfies SlashCommand
