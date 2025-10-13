import { Logger } from '../modules'
import { red } from '../util/colors'
const logger = new Logger('/hoi4hours')

import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types'
import { EMBI_ID, PING_EMBI } from '../util/constants'

const { STEAM_API_KEY, STEAM_ID } = process.env

export default {
    data: new SlashCommandBuilder()
        .setName('hoi4hours')
        .setDescription('Checks the Steam API for embi\'s hours in HOI4.')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    async execute(ctx) {
        if (!STEAM_API_KEY || !STEAM_ID) {
            await ctx.reply('❌ Steam API key or ID is not configured for this bot. Please contact the bot owner.')
            if (ctx.guild?.members.cache.has(EMBI_ID)) {
                await ctx.followUp(
                    'nevermind ill do it myself,\n\n' +
                    `${PING_EMBI} check \`env.STEAM_API_KEY\` and \`env.STEAM_ID\` you dipshit`
                )
            }
            return
        }

        await ctx.deferReply()

        const hoi4AppId = 394360

        const games = await getOwnedGames(STEAM_ID!)
        const hoi4 = games.find(game => game.appid === hoi4AppId)
        if (!hoi4) {
            await ctx.editReply(`❌ HOI4 not found in the list of games (did ${ctx.pingEmbi} finally touch grass? check his steam profile directly or something)`)
            return
        }

        const totalHours = hoi4.playtime_forever / 60
        const hours = totalHours.toFixed(4)

        const days = Math.floor(totalHours / 24)
        const months = Math.floor(days / 30)
        const years = Math.floor(days / 365)
        const remainingDays = days % 365 % 30
        const remainingHours = Math.floor(totalHours % 24)
        const remainingMinutes = Math.floor((totalHours % 1) * 60)

        let timeString = ''
        if (years > 0) timeString += `${years}y `
        if (months > 0) timeString += `${months}M `
        if (remainingDays > 0) timeString += `${remainingDays}d `
        if (remainingHours > 0) timeString += `${remainingHours}h `
        if (remainingMinutes > 0) timeString += `${remainingMinutes}m`

        await ctx.editReply(`${ctx.pingEmbi} has spent **${hours}** hours playing Hearts of Iron 4.\nThat's approximately **${timeString.trim()}**.`)

    }
} satisfies SlashCommand

type SteamAPIOwnedGame = {
    appid: number
    playtime_forever: number
}
interface SteamAPIResponse {
    response: {
        games: SteamAPIOwnedGame[]
    }
}
async function getOwnedGames(steamId: string): Promise<SteamAPIOwnedGame[]> {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json`
    const response = await fetch(url)
    let data: SteamAPIResponse
    try {
        data = await response.json()
    } catch (error) {
        const textResponse = await response.text()
        logger.warn(`Failed to parse JSON response from Steam API. Falling back to text. Raw response:\n\`\`\`\n${textResponse}\n\`\`\``)
        logger.warn(red(error instanceof Error ? error.stack ?? error.message : String(error)))
        return []
    }
    const { games } = data.response
    return games
}
