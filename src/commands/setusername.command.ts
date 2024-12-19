import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
const logger = new Logger('command.setusername')

export default {
    data: new SlashCommandBuilder()
        .setName('setusername')
        .setDescription('Change bot username')
        .addStringOption(so => so
            .setName('username')
            .setDescription('New username')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('shortcut')
            .setDescription('Shortcut to change username to either guild name, your username, or your guild username')
            .addChoices(
                { name: 'Guild Name', value: 'guild' },
                { name: 'Your Username', value: 'user' },
                { name: 'Your Guild Username', value: 'guilduser' }
            )
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        logger.info('Command executed')
        await interaction.deferReply({
            ephemeral: interaction.options.getBoolean('ephemeral', false) ?? undefined
        })

        let username = interaction.options.getString('username')
        const shortcut = interaction.options.getString('shortcut')

        if (!username && !shortcut) {
            await interaction.editReply('❌ You must provide a username or use a shortcut')
            return
        }

        if (shortcut === 'guild') {
            if (!interaction.guild) {
                await interaction.editReply('❌ This shortcut can only be used in a guild channel')
                return
            }
            username = interaction.guild.name
        } else if (shortcut === 'user') {
            username = interaction.user.username
        } else if (shortcut === 'guilduser') {
            if (!interaction.guild) {
                await interaction.editReply('❌ This shortcut can only be used in a guild channel')
                return
            }
            username = interaction.member!.user.username ?? interaction.user.username
        }

        if (!username) {
            await interaction.editReply('❌ You must provide a username or use a shortcut')
            return
        }

        logger.info(`Changing username to ${username}...`)
        try {
            await interaction.client.user.setUsername(username)
        } catch (e) {
            if ((e as Error).message.includes('USERNAME_RATE_LIMIT')) {
                logger.error('Hit the username change rate limit')
                await interaction.editReply('❌ Hit the username change rate limit')
                return
            }
            logger.error(`Error changing username: ${(e as Error).message}`)
            await interaction.editReply(`❌ Error changing username: ${(e as Error).message}`)
            return
        }
        logger.ok(`Username changed, current username is ${interaction.client.user.username}`)
        await interaction.editReply(`✅ Username changed to ${username}`)
        logger.ok(`Command execution over`)
    }
} satisfies SlashCommand
