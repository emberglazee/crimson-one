import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'

// since you fuckers couldnt behave and got dyno's roll command banned
export default {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Do a dice roll 🎲')
        .addNumberOption(no => no
            .setName('sides')
            .setDescription('Number of sides on the dice')
            .setRequired(false) // default to d20
        ).addStringOption(so => so
            .setName('action')
            .setDescription('What action is the roll for?')
            .setRequired(false) // if none, dont mention it
        ).addUserOption(uo => uo
            .setName('user')
            .setDescription('Who is the roll for?')
            .setRequired(false) // will default to my user
        ),
    async execute(interaction) {
        const sides = interaction.options.getNumber('sides') || 20
        const action = interaction.options.getString('action')
        const user = interaction.options.getUser('user') || interaction.user
        const roll = Math.floor(Math.random() * sides) + 1
        const isNat = roll === 1 || roll === sides
        const rollText = isNat ? `nat ${roll}` : roll.toString()
        const message = action 
            ? `${user} rolls ${rollText} (🎲 d${sides}) for ${action}` 
            : `${user} rolls ${rollText} (🎲 d${sides})`
        await interaction.reply(message)
    }
} satisfies SlashCommand
