import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand, type Emojis } from '../types'
import { readFile } from 'fs/promises'
import { getRandomElement } from '../util/functions'
import { join } from 'path'

let emojis: string[] = []

export default {
    data: new SlashCommandBuilder()
        .setName('randombilly')
        .setDescription('Sends a random "billy" emoji')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        let deferred = false
        if (!emojis.length) {
            await ctx.deferReply()
            deferred = true
            const json = JSON.parse(
                await readFile(join(__dirname, '../../data/emojis.json'), 'utf-8')
            ) as Emojis
            emojis = json.billy
        }
        const emoji = getRandomElement(emojis)
        const str = emoji

        deferred ? await ctx.editReply(str) : await ctx.reply(str)
    }
} satisfies SlashCommand
