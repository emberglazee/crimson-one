import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { inspect } from 'util'
import { EMBERGLAZE_ID } from '../util/constants'

export default {
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('Evaluate JavaScript code')
        .addStringOption(option => option
            .setName('code')
            .setDescription('The code to evaluate')
            .setRequired(true)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        const user = interaction.user
        if (user.id !== EMBERGLAZE_ID) {
            await interaction.reply({
                content: '❌ You, solely, are responsible for this',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        await interaction.deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })

        const code = interaction.options.getString('code', true)
        try {
            const result = eval(code)
            const output = typeof result === 'string' ? result : inspect(result)
            await interaction.editReply(`\`\`\`js\n${output}\n\`\`\``)
        } catch (error) {
            await interaction.editReply(`\`\`\`js\n${error}\n\`\`\``)
        }
    }
} satisfies SlashCommand