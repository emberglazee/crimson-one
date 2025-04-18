import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import fs from 'fs/promises'
import { getRandomElement } from '../util/functions'
import { join } from 'path'
import type { Emoji, Emojis } from '../types/types'

let emojis: Emoji[] = []

export default {
    data: new SlashCommandBuilder()
        .setName('randombilly')
        .setDescription('Send a random billy emoji')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction, { deferReply, editReply, reply }) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        let deferred = false
        if (!emojis.length) {
            await deferReply({
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
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

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        deferred ? await editReply(str) : await reply({
            content: str,
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
    }
} satisfies SlashCommand
