import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { ModeManager } from '../modules/ModeManager'

export default {
    data: new SlashCommandBuilder()
        .setName('mode')
        .setDescription('Manage the bot\'s active mode (owner only)')
        .addSubcommand(sub => sub
            .setName('switch')
            .setDescription('Switch between CrimsonChat and ShapesInc')
            .addStringOption(opt => opt
                .setName('bot')
                .setDescription('The bot to switch to')
                .setRequired(true)
                .addChoices(
                    { name: 'CrimsonChat', value: 'crimsonchat' },
                    { name: 'ShapesInc', value: 'shapesinc' }
                )
            )
        ).addSubcommand(sub => sub
            .setName('shapesinc_solo')
            .setDescription('Toggle solo mode for ShapesInc')
            .addBooleanOption(opt => opt
                .setName('enabled')
                .setDescription('Enable or disable solo mode')
                .setRequired(true)
            )
        ),
    async execute(context) {
        if (!context.isEmbi) {
            await context.reply('❌ You, solely, are responsible for this.')
            return
        }

        const modeManager = ModeManager.getInstance()
        const subcommand = context.getSubcommand()

        switch (subcommand) {
            case 'switch': {
                const bot = context.getStringOption('bot', true) as 'crimsonchat' | 'shapesinc'
                await modeManager.setActiveMode(bot)
                await context.reply(`✅ Switched active mode to **${bot}**.`)
                break
            }
            case 'shapesinc_solo': {
                const enabled = context.getBooleanOption('enabled', true)
                try {
                    await modeManager.setShapesIncSolo(enabled)
                    await context.reply(`✅ ShapesInc solo mode is now **${enabled ? 'ENABLED' : 'DISABLED'}**. The bot will now only respond as Crimson 1.`)
                } catch (error) {
                    await context.reply(`❌ ${(error as Error).message}`)
                }
                break
            }
        }
    }
} satisfies SlashCommand
