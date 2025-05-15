import { SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types/types'
import { shapesInc } from '..'
export default {
    data: new SlashCommandBuilder()
        .setName('shapesinc')
        .setDescription('Set of commands to manage the shapes.inc chat')
        .addSubcommand(sc => sc
            .setName('wack')
            .setDescription('Clear chat history')
        ).addSubcommand(sc => sc
            .setName('change_shape')
            .setDescription('Change the shape used by the bot')
            .addStringOption(so => so
                .setName('vanity')
                .setDescription('The vanity of the shape to use')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('uuid')
                .setDescription('The UUID of the shape to use')
                .setRequired(false)
            )
        ),
    async execute({ reply }, interaction) {
        const subcommand = interaction.options.getSubcommand()
        switch (subcommand) {
            case 'wack':
                await shapesInc.clearChat()
                await reply('Chat history cleared')
                break
            case 'change_shape':
                const vanity = interaction.options.getString('vanity')
                const uuid = interaction.options.getString('uuid')
                if (vanity) {
                    await shapesInc.changeShapeByUsername(vanity)
                }
                if (uuid) {
                    await shapesInc.changeShapeByUUID(uuid)
                }
                await reply(`Shape changed to ${shapesInc.shapeUsername}`)
                break
        }
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
