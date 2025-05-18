import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import fs from 'fs/promises'
import { getRandomElement } from '../util/functions'
import { join } from 'path'
import type { Emojis } from '../types/types'

let emojis: string[] = []

export default {
    data: new SlashCommandBuilder()
        .setName('randombilly')
        .setDescription('Send a random billy emoji'),
    async execute(context) {
        let deferred = false
        if (!emojis.length) {
            await context.deferReply()
            deferred = true
            const json = JSON.parse(
                await fs.readFile(join(__dirname, '../../data/emojis.json'), 'utf-8')
            ) as Emojis
            emojis = json.billy
        }
        const emoji = getRandomElement(emojis)
        const str = emoji

        deferred ? await context.editReply(str) : await context.reply(str)
    }
} satisfies SlashCommand
