import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

export default {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Do a dice roll 🎲')
        .addNumberOption(no => no
            .setName('sides')
            .setDescription('Number of sides on the dice (default: 20)')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('action')
            .setDescription('What action is the roll for?')
            .setRequired(false)
        ).addUserOption(uo => uo
            .setName('user')
            .setDescription('Who is the roll for?')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response only show up for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        const user = interaction.options.getUser('user') || interaction.user
        const channel = interaction.channel

        const sides = interaction.options.getNumber('sides') || 20
        const action = interaction.options.getString('action')
        const roll = Math.floor(Math.random() * sides) + 1
        const isNat = roll === 1 || roll === sides
        const rollText = isNat ? `nat ${roll}` : roll.toString()
        let message = action 
            ? `${user} rolls ${rollText} (🎲 d${sides}) for ${action}` 
            : `${user} rolls ${rollText} (🎲 d${sides})`
        if (channel && channel.id === '311334325402599425') {
            message += '\n-# dont spam the command here or else'
        }
        await interaction.reply({
            content: message,
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
    }
} satisfies SlashCommand
