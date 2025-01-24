import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
import { inspect } from 'util'
const logger = new Logger('command.eval')

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
        logger.info('Command executed')

        const user = interaction.user
        if (user.id !== '341123308844220447') {
            await interaction.reply('❌ You, solely, are responsible for this')
            return
        }

        const ephemeral = interaction.options.getBoolean('ephemeral', false) || undefined
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