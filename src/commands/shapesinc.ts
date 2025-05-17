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
            ).addStringOption(so => so
                .setName('shape_a')
                .setDescription('Username of the first shape (required if enabling)')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('shape_b')
                .setDescription('Username of the second shape (required if enabling)')
                .setRequired(false)
            ).addStringOption(so => so
                .setName('channel_id')
                .setDescription('Channel ID for the duel (required if enabling)')
                .setRequired(false)
            )
        ).addSubcommand(sc => sc
            .setName('set_cookies')
            .setDescription('Update ShapesInc cookies (EMBERGLAZE only)')
            .addAttachmentOption(ao => ao
                .setName('cookies')
                .setDescription('Netscape cookies.txt file')
                .setRequired(true)
            )
        ),
    async execute(context) {
        const { editReply, deferReply, myId } = context
        await deferReply()
        const subcommand = context.getSubcommand()
        switch (subcommand) {
            case 'wack':
                await shapesInc.clearChat()
                await editReply('Chat history cleared')
                break
            case 'change_shape':
                const vanity = await context.getStringOption('vanity')
                const uuid = await context.getStringOption('uuid')
                if (vanity) {
                    await shapesInc.changeShapeByUsername(vanity)
                }
                if (uuid) {
                    await shapesInc.changeShapeByUUID(uuid)
                }
                await editReply(`Shape changed to ${shapesInc.shapeUsername}`)
                break
            case 'duel_mode': {
                const enabled = await context.getBooleanOption('enabled')
                if (enabled) {
                    const shapeAInput = await context.getStringOption('shape_a')
                    const shapeBInput = await context.getStringOption('shape_b')
                    const channelId = await context.getStringOption('channel_id')
                    if (!shapeAInput || !shapeBInput || !channelId) {
                        await editReply('You must provide shape_a, shape_b, and channel_id to enable duel mode.')
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
                        await editReply('Failed to load one or both shapes. Please check the usernames.')
                        return
                    }
                    await shapesInc.enableDuelMode(shapeA, shapeB, channelId)
                    await editReply(`Duel mode enabled between ${shapeA} and ${shapeB} in <#${channelId}>.`)
                } else {
                    shapesInc.disableDuelMode()
                    await editReply('Duel mode disabled.')
                }
                break
            }
            case 'set_cookies': {
                const user = context.user
                if (user.id !== myId) {
                    await context.reply('❌ You, solely, are responsible for this')
                    return
                }
                const attachment = await context.getAttachmentOption('cookies', true)
                if (!attachment.name.toLowerCase().includes('cookie')) {
                    await editReply('❌ The file name must contain "cookie".')
                    return
                }
                try {
                    const res = await fetch(attachment.url)
                    const content = await res.text()
                    const { parseNetscapeCookieFile } = await import('../util/functions')
                    const cookiesArr = parseNetscapeCookieFile(content)
                    if (!cookiesArr.length) throw new Error('No cookies parsed from file')
                    const cookiesStr = cookiesArr.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
                    const fs = (await import('fs/promises')).default
                    const path = (await import('path')).default
                    await fs.writeFile(path.join(__dirname, '../../data/shapesinc-cookies.txt'), content, 'utf-8')
                    const { shapesInc } = await import('..')
                    shapesInc.cookies = cookiesStr
                    await editReply('✅ Cookies updated from file!')
                } catch (err) {
                    await editReply('❌ Failed to update cookies: ' + (err instanceof Error ? err.message : String(err)))
                }
                break
            }
        }
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
