import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

const usageTracker = new Map<string, number[]>()
const USAGE_LIMIT = 2
const WINDOW_MINUTES = 10

function canExecuteCommand(): boolean {
    const now = Date.now()
    const key = 'setusername'
    const timestamps = usageTracker.get(key) ?? []

    // Clean up old timestamps
    const windowMs = WINDOW_MINUTES * 60 * 1000
    const validTimestamps = timestamps.filter(t => now - t < windowMs)

    if (validTimestamps.length >= USAGE_LIMIT) return false
    usageTracker.set(key, validTimestamps)
    return true
}

function trackSuccessfulExecution() {
    const key = 'setusername'
    const timestamps = usageTracker.get(key) ?? []
    timestamps.push(Date.now())
    usageTracker.set(key, timestamps)
}

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
    async execute(interaction, { reply, deferReply, editReply, client, myId, guild }) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        const user = interaction.user
        if (user.id !== myId) {
            await reply({
                content: '❌ You, solely, are responsible for this',
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        if (!canExecuteCommand()) {
            await reply({
                content: `❌ This command can only be ran ${USAGE_LIMIT} times every ${WINDOW_MINUTES} minutes, to avoid API rate limiting`,
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            return
        }

        await deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })

        let username = interaction.options.getString('username')
        const shortcut = interaction.options.getString('shortcut')
        if (!username && !shortcut) {
            await editReply('❌ You must provide either a username or a shortcut')
            return
        }
        if (shortcut === 'guild') {
            if (!guild) {
                await editReply('❌ The `guild` shortcut can only be used in a guild channel')
                return
            }
            username = guild.name
        } else if (shortcut === 'user') {
            username = interaction.user.username
        } else if (shortcut === 'guilduser') {
            if (!guild) {
                await editReply('❌ The `guilduser` shortcut can only be used in a guild channel')
                return
            }
            username = interaction.member!.user.username ?? interaction.user.username
        }

        if (!username) {
            await editReply('❌ Unexpected error: Username could not be determined')
            return
        }

        try {
            await client.user.setUsername(username)
            trackSuccessfulExecution()
        } catch (e) {
            if ((e as Error).message.includes('USERNAME_RATE_LIMIT')) {
                await editReply('❌ Hit the username change rate limit')
                return
            }
            await editReply(`❌ Error changing username: ${(e as Error).message}`)
            return
        }
        await editReply(`✅ Username changed to ${username}`)
    }
} satisfies SlashCommand
