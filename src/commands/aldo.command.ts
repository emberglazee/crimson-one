import { SlashCommand } from '../modules/CommandManager'
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import axios from 'axios'
import { load } from 'cheerio'
import { getRandomElement } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('aldo')
        .setDescription('The wikipedia nerd')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction, { deferReply, editReply }) {
        const ephemeral = interaction.options.getBoolean('ephemeral', false)
        await deferReply({
            flags: ephemeral ? MessageFlags.Ephemeral : undefined
        })
        const url = await randomProjectWingmanArticle().catch(() => '❌ Failed to get article')
        await editReply(url)
    },
} satisfies SlashCommand

async function randomProjectWingmanArticle(): Promise<string> {
    const url = 'https://projectwingman.wiki.gg/wiki/Special:AllPages'
    const res = await axios.get(url)
    const $ = load(res.data)

    // Select all the <a> tags within the list items.
    const articleLinks: string[] = []
    $('#mw-content-text > div.mw-allpages-body > ul > li > a').each((_, element) => {
        const href = $(element).attr('href')
        if (href && href.startsWith('/wiki/') && !href.includes(':')) {
            articleLinks.push(`https://projectwingman.wiki.gg${href}`)
        }
    })

    const randomLink = getRandomElement(articleLinks)
    return randomLink
}
