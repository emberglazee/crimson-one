import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'
import fs from 'fs/promises'
import { getRandomElement } from '../util/functions'
import { join } from 'path'
import type { Emoji, Emojis } from '../types/types'

let emojis: Emoji[] = []

export default {
    data: new SlashCommandBuilder()
        .setName('randombilly')
        .setDescription('Send a random billy emoji'),
    async execute(context) {
        const { reply, deferReply, editReply } = context

        let deferred = false
        if (!emojis.length) {
            await deferReply()
            deferred = true
            const json = JSON.parse(
                await fs.readFile(join(__dirname, '../../data/emojis.json'), 'utf-8')
            ) as Emojis
            emojis = json.billy
        }
        const emoji = getRandomElement(emojis)
        const emojiName = Object.keys(emoji)[0]
        const emojiID = Object.values(emoji)[0]
        const str = `<:${emojiName}:${emojiID}>`

        deferred ? await editReply(str) : await reply(str)
    }
} satisfies SlashCommand
