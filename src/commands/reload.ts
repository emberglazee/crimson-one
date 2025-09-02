import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { CommandManager } from '../modules'

export default {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reloads commands.')
        .addSubcommand(subcommand => subcommand
            .setName('all')
            .setDescription('Reloads all commands.')
        ).addSubcommand(subcommand => subcommand
            .setName('command')
            .setDescription('Reloads a specific command.')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the command to reload.')
                .setRequired(true)
            )
        ),
    async execute(ctx) {
        try { await ctx.assertEmbi() } catch { return }

        const subcommand = ctx.getSubcommand(true)
        const commandManager = CommandManager.getInstance()

        await ctx.deferReply({ ephemeral: true })

        try {
            if (subcommand === 'all') {
                await commandManager.init()
                await ctx.editReply('✅ All commands have been reloaded.')
            } else if (subcommand === 'command') {
                const commandName = ctx.getStringOption('name', true)
                await commandManager.reloadCommand(commandName)
                await ctx.editReply(`✅ Command '${commandName}' has been reloaded.`)
            }
        } catch (error) {
            await ctx.editReply(`❌ Failed to reload commands: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }
} satisfies SlashCommand
