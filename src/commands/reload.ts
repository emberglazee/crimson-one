import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import CommandManager from '../modules/CommandManager'

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
    async execute(context) {
        if (!context.isEmbi) {
            await context.reply('❌ You, solely, are responsible for this.')
            return
        }

        const subcommand = context.getSubcommand(true)
        const commandManager = CommandManager.getInstance()

        await context.deferReply({ ephemeral: true })

        try {
            if (subcommand === 'all') {
                await commandManager.init()
                await context.editReply('✅ All commands have been reloaded.')
            } else if (subcommand === 'command') {
                const commandName = context.getStringOption('name', true)
                await commandManager.reloadCommand(commandName)
                await context.editReply(`✅ Command '${commandName}' has been reloaded.`)
            }
        } catch (error) {
            await context.editReply(`❌ Failed to reload commands: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }
} satisfies SlashCommand
