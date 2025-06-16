import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

const { STEAM_API_KEY, STEAM_ID } = process.env

export default {
    data: new SlashCommandBuilder()
        .setName('hoi4hours')
        .setDescription('Check the Steam API for embi\'s hours in HOI4'),
    async execute(context) {
        await context.deferReply()

        const hoi4AppId = 394360

        const games = await getOwnedGames(STEAM_ID!)
        const hoi4 = games.find(game => game.appid === hoi4AppId)
        if (!hoi4) {
            await context.editReply(`❌ HOI4 not found in the list of games (did ${context.pingMe} finally touch grass? check his steam profile directly or something)`)
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

        await context.editReply(`${context.pingMe} has spent \`${hours}\` hours playing HOI4\nThat's approximately: \`${timeString.trim()}\``)
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
    const data: SteamAPIResponse = await response.json()
    const { games } = data.response
    return games
}
