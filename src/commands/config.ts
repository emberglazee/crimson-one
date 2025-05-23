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
            .setName('scream-on-sight')
            .setDescription('Toggle the scream on sight feature')
            .addBooleanOption(bo => bo
                .setName('enabled')
                .setDescription('Whether to enable the scream on sight feature')
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
            const prefix = await context.getStringOption('prefix')
            if (!prefix) {
                await context.editReply('❌ You must provide a prefix')
                return
            }
            const guildConfig = await GuildConfigManager.getInstance().getConfig(context.guild!.id)
            guildConfig.prefix = prefix
            await GuildConfigManager.getInstance().setConfig(context.guild!.id, guildConfig)
            await context.editReply(`✅ Prefix changed to ${prefix}`)
        }
        if (subcommand === 'scream-on-sight') {
            const enabled = await context.getBooleanOption('enabled')
            if (enabled === null) {
                await context.editReply('❌ You must provide a boolean value')
                return
            }
            await GuildConfigManager.getInstance().setConfig(context.guild.id, { screamOnSight: enabled })
            await context.editReply(`${boolToEmoji(enabled)} Scream on sight set to ${enabled}`)
        }
        if (subcommand === 'get') {
            const guildConfig = await GuildConfigManager.getInstance().getConfig(context.guild.id)
            await context.editReply(`Current config for ${context.guild.name}:\n- Prefix: ${guildConfig.prefix}\n- Scream on sight: ${boolToEmoji(guildConfig.screamOnSight)}`)
        }
    }
} satisfies SlashCommand
