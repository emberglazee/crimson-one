import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import { SlashCommand } from '../types/types'
import { inspect } from 'util'

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
    async execute({ reply, deferReply, editReply, myId }, interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        const user = interaction.user
        if (user.id !== myId) {
            await reply({
                content: '❌ You, solely, are responsible for this',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        await deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })

        const code = interaction.options.getString('code', true)
        try {
            const result = eval(code)
            const output = typeof result === 'string' ? result : inspect(result)
            await editReply(`\`\`\`js\n${output}\n\`\`\``)
        } catch (error) {
            await editReply(`\`\`\`js\n${error}\n\`\`\``)
        }
    }
} satisfies SlashCommand
