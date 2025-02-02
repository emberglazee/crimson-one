import { GuildSlashCommand } from '../modules/CommandManager'
import { SlashCommandBuilder } from 'discord.js'
import { parse } from 'chrono-node'

import { ReminderManager } from '../modules/CrimsonChat/utils/Reminder'
const reminder = ReminderManager.getInstance()

export default {
    data: new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('Tell Crimson 1 to remind you about something in the future')
        .addStringOption(so => so
            .setName('message')
            .setDescription('The message to remind you about')
            .setRequired(true)
        ).addStringOption(so => so
            .setName('fixedtime')
            .setDescription('The time to remind you at (include a timezone!)')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('relativetime')
            .setDescription('Like "in 5 minutes"')
            .setRequired(false)
        ),
    async execute(interaction) {
        const message = interaction.options.getString('message', true)
        const fixedTime = interaction.options.getString('fixedtime')
        const relativeTime = interaction.options.getString('relativetime')

        if (!fixedTime && !relativeTime) {
            await interaction.reply({ content: 'You must provide either a fixed time or a relative time', ephemeral: true })
            return
        }

        if (fixedTime && relativeTime) {
            await interaction.reply({ content: 'You must provide either a fixed time or a relative time, not both', ephemeral: true })
            return
        }

        const triggerTime = fixedTime ? new Date(fixedTime).getTime() : Date.now() + parse(relativeTime!)[0].start.date().getTime()

        await reminder.createReminder({
            id: interaction.id,
            userId: interaction.user.id,
            username: interaction.user.username,
            message,
            triggerTime
        })

        await interaction.reply({ content: 'Reminder set!', ephemeral: true })
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
