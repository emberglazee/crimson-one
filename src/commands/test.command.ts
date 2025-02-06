import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        await interaction.reply({
            content: `Test command executed, ephemeral: ${ephemeral}`,
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
    }
} satisfies SlashCommand
