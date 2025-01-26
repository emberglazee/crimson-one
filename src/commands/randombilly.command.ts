import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import fs from 'fs/promises'
import { randArr } from '../util/functions'
import { join } from 'path'
import type { Emoji, Emojis } from '../types/types'

import { Logger } from '../util/logger'
const logger = new Logger('command.randombilly')

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
        logger.info('Command executed')

        let deferred = false
        if (!emojis.length) {
            await interaction.deferReply({
                flags: interaction.options.getBoolean('ephemeral', false) ? MessageFlags.Ephemeral : undefined
            })
            deferred = true
            logger.info('`emojis` not set, reading emojis.json...')
            const json = JSON.parse(
                await fs.readFile(join(__dirname, '../../data/emojis.json'), 'utf-8')
            ) as Emojis
            emojis = json.billy
            logger.ok('emojis.json read, `emojis` set')
        }
        const emoji = randArr(emojis)
        const emojiName = Object.keys(emoji)[0]
        const emojiID = Object.values(emoji)[0]
        logger.info(`Sending ${emojiName}...`)
        const str = `<:${emojiName}:${emojiID}>`
        deferred ? await interaction.editReply(str) : await interaction.reply(str)

        logger.ok('Command execution over')
    }
} satisfies SlashCommand
