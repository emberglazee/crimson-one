import {
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder
} from 'discord.js'
import { SlashCommand } from '../types'

export default {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reloads commands (bot owner only).')
        .addSubcommand(subcommand =>
            subcommand.setName('all').setDescription('Reloads all commands.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('command')
                .setDescription('Reloads a specific command.')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('The name of the command to reload.')
                        .setRequired(true)
                )
        )
        .setContexts(
            InteractionContextType.BotDM,
            InteractionContextType.Guild,
            InteractionContextType.PrivateChannel
        ),
    async execute(ctx) {
        if (!(await ctx.checkEmbi())) return

        const subcommand = ctx.getSubcommand(true)

        await ctx.deferReply({ flags: MessageFlags.Ephemeral })

        try {
            if (subcommand === 'all') {
                await ctx.commandManager.init()
                await ctx.editReply('✅ All commands have been reloaded.')
            } else if (subcommand === 'command') {
                const commandName = ctx.getStringOption('name', true)
                await ctx.commandManager.reloadCommand(commandName)
                await ctx.editReply(
                    `✅ The command '${commandName}' has been reloaded.`
                )
            }
        } catch (error) {
            await ctx.editReply(
                `❌ Failed to reload commands: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }
    }
} satisfies SlashCommand
