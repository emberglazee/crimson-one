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
        ).addSubcommand(sc => sc
            .setName('duel_mode')
            .setDescription('Toggle duel mode (one-on-one shape conversation)')
            .addBooleanOption(bo => bo
                .setName('enabled')
                .setDescription('Enable or disable duel mode')
                .setRequired(true)
            )
            .addStringOption(so => so
                .setName('shape_a')
                .setDescription('Username of the first shape (required if enabling)')
                .setRequired(false)
            )
            .addStringOption(so => so
                .setName('shape_b')
                .setDescription('Username of the second shape (required if enabling)')
                .setRequired(false)
            )
            .addStringOption(so => so
                .setName('channel_id')
                .setDescription('Channel ID for the duel (required if enabling)')
                .setRequired(false)
            )
        ),
    async execute({ reply }, interaction) {
        await interaction.deferReply()
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
            case 'duel_mode': {
                const enabled = interaction.options.getBoolean('enabled')
                if (enabled) {
                    const shapeAInput = interaction.options.getString('shape_a')
                    const shapeBInput = interaction.options.getString('shape_b')
                    const channelId = interaction.options.getString('channel_id')
                    if (!shapeAInput || !shapeBInput || !channelId) {
                        await reply('You must provide shape_a, shape_b, and channel_id to enable duel mode.')
                        return
                    }
                    await shapesInc.addShapeByUsername(shapeAInput)
                    await shapesInc.addShapeByUsername(shapeBInput)
                    // Get canonical usernames from the map, safely
                    const usernames = Array.from(shapesInc.getShapeUsernames()).filter(u => typeof u === 'string')
                    const shapeA = usernames.find(u => (typeof u === 'string' && typeof shapeAInput === 'string' && u.toLowerCase() === shapeAInput.toLowerCase()) || u === shapeAInput)
                    const shapeB = usernames.find(u => (typeof u === 'string' && typeof shapeBInput === 'string' && u.toLowerCase() === shapeBInput.toLowerCase()) || u === shapeBInput)
                    if (!shapeA || !shapeB) {
                        console.warn('Available usernames:', usernames)
                        await reply('Failed to load one or both shapes. Please check the usernames.')
                        return
                    }
                    await shapesInc.enableDuelMode(shapeA, shapeB, channelId)
                    await reply(`Duel mode enabled between ${shapeA} and ${shapeB} in <#${channelId}>.`)
                } else {
                    shapesInc.disableDuelMode()
                    await reply('Duel mode disabled.')
                }
                break
            }
        }
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
