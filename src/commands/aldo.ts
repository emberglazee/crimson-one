import { SlashCommand } from '../types/types'
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
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
    async execute({ deferReply, editReply }, interaction) {
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
    const res = await fetch(url)
    const html = await res.text()
    const $ = load(html)

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
