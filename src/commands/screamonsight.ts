import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import GuildConfigManager from '../modules/GuildConfig'

export default {
    data: new SlashCommandBuilder()
        .setName('screamonsight')
        .setDescription('Toggle the screamonsight feature')
        .addBooleanOption(option => option
            .setName('enabled')
            .setDescription('Whether to enable or disable the screamonsight feature')
            .setRequired(true)
        ),
    async execute(context) {
        if (!context.guild) {
            await context.reply('nope, this is only for servers')
            return
        }
        const enabled = await context.getBooleanOption('enabled')
        const { screamOnSight } = await GuildConfigManager.getInstance().getConfig(context.guild.id)
        const newState = enabled ?? !screamOnSight
        await GuildConfigManager.getInstance().setConfig(context.guild.id, { screamOnSight: newState })
        await context.reply(`screamonsight is now ${newState ? 'enabled' : 'disabled'}`)
    }
} satisfies SlashCommand
