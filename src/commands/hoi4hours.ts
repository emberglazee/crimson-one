import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

const { STEAM_API_KEY, STEAM_ID } = process.env

export default {
    data: new SlashCommandBuilder()
        .setName('hoi4hours')
        .setDescription('Check the Steam API for emberglaze\'s hours in HOI4'),
    async execute(context) {
        const { editReply, deferReply } = context
        await deferReply()

        interface SteamAPIResponse {
            response: {
                games: Array<{
                    appid: number
                    playtime_forever: number
                }>
            }
        }
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`
        const response = await fetch(url)
        const data: SteamAPIResponse = await response.json()
        const games = data.response.games
        const hoi4 = games.find(game => game.appid === 394360)
        if (hoi4) {
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

            await editReply(`emberglaze has spent \`${hours}\` hours playing HOI4\nThat's approximately ${timeString.trim()}`)
        } else {
            await editReply('❌ HOI4 not found in the list of games (did embi finally touch grass? check his steam profile directly or something)')
        }
    }
} satisfies SlashCommand
