import { SlashCommand } from '../modules/CommandManager'
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import axios from 'axios'
import { load } from 'cheerio'

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
        const url = await randomUnusualArticle().catch(() => '❌ Failed to get article')
        await editReply(url)
    },
} satisfies SlashCommand

async function randomUnusualArticle(): Promise<string> {
    const url = 'https://en.wikipedia.org/wiki/Wikipedia:Unusual_articles'
    const res = await axios.get(url)
    const $ = load(res.data)
    const articleLinks: string[] = []
    $('div.mw-parser-output ul li a').each((_, element) => {
        const href = $(element).attr('href')
        if (href && href.startsWith('/wiki/') && !href.includes(':')) {
            articleLinks.push(`https://en.wikipedia.org${href}`)
        }
    })
    const randomLink = articleLinks[Math.floor(Math.random() * articleLinks.length)]
    return randomLink
}
