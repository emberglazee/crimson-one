import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { ModeManager } from '../modules/ModeManager'

export default {
    data: new SlashCommandBuilder()
        .setName('mode')
        .setDescription('Manage the bot\'s active mode (owner only)')
        .addSubcommand(subcommand => subcommand
            .setName('switch')
            .setDescription('Switch between CrimsonChat and ShapesInc')
            .addStringOption(option => option
                .setName('bot')
                .setDescription('The bot to switch to')
                .setRequired(true)
                .addChoices(
                    { name: 'CrimsonChat', value: 'crimsonchat' },
                    { name: 'ShapesInc', value: 'shapesinc' }
                )
            )
        ).addSubcommand(subcommand => subcommand
            .setName('shapesinc_solo')
            .setDescription('Toggle solo mode for ShapesInc')
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Enable or disable solo mode')
                .setRequired(true)
            )
        ),
    async execute(ctx) {
        try { await ctx.assertEmbi() } catch { return }

        const modeManager = ModeManager.getInstance()
        const subcommand = ctx.getSubcommand()

        switch (subcommand) {
            case 'switch': {
                const bot = ctx.getStringOption('bot', true) as 'crimsonchat' | 'shapesinc'
                await modeManager.setActiveMode(bot)
                await ctx.reply(`✅ Switched active mode to **${bot}**.`)
                break
            }
            case 'shapesinc_solo': {
                const enabled = ctx.getBooleanOption('enabled', true)
                try {
                    await modeManager.setShapesIncSolo(enabled)
                    await ctx.reply(`✅ ShapesInc solo mode is now **${enabled ? 'ENABLED' : 'DISABLED'}**. The bot will now only respond as Crimson 1.`)
                } catch (error) {
                    await ctx.reply(`❌ ${(error as Error).message}`)
                }
                break
            }
        }
    }
} satisfies SlashCommand
