import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import fs from 'fs/promises'
import { randArr } from '../util/functions'
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
    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)

        let deferred = false
        if (!emojis.length) {
            await interaction.deferReply({
                flags: ephemeral ? MessageFlags.Ephemeral : undefined
            })
            deferred = true
            const json = JSON.parse(
                await fs.readFile(join(__dirname, '../../data/emojis.json'), 'utf-8')
            ) as Emojis
            emojis = json.billy
        }
        const emoji = randArr(emojis)
        const emojiName = Object.keys(emoji)[0]
        const emojiID = Object.values(emoji)[0]
        const str = `<:${emojiName}:${emojiID}>`
        deferred ? await interaction.editReply(str) : await interaction.reply({
            content: str,
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
    }
} satisfies SlashCommand
