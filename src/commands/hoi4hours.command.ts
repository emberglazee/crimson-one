import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../modules/CommandManager'
import { Logger } from '../util/logger'
const logger = new Logger('command.hoi4hours')

export default {
    data: new SlashCommandBuilder()
        .setName('hoi4hours')
        .setDescription('Check the Steam API for emberglaze\'s hours in HOI4')
        .addBooleanOption(bo => bo
            .setName('ephemeral')
            .setDescription('Should the response show up only for you?')
            .setRequired(false)
        ),
    async execute(interaction) {
        logger.info('Command executed')
        await interaction.deferReply({
            ephemeral: interaction.options.getBoolean('ephemeral', false) ?? undefined
        })

        interface SteamAPIResponse {
            response: {
                games: Array<{
                    appid: number
                    playtime_forever: number
                }>
            }
        }
        const url: string = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${process.env.STEAM_API_KEY}&steamid=${process.env.STEAM_ID}&format=json`
        logger.info(`Fetching ${url}...`)
        const response = await fetch(url)
        logger.info('Fetched')
        const data: SteamAPIResponse = await response.json()
        logger.info('Parsed')
        const games = data.response.games
        const hoi4 = games.find(game => game.appid === 394360)
        if (hoi4) {
            const totalHours = hoi4.playtime_forever / 60
            const hours = totalHours.toFixed(4)
            logger.info(`Hours played: ${hours}`)

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

            await interaction.editReply(`emberglaze has spent \`${hours}\` hours playing HOI4\nThat's approximately ${timeString.trim()}`)
        } else {
            logger.info('HOI4 not found in the list of games')
            await interaction.editReply('❌ HOI4 not found in the list of games (did ember finally touch grass? check his steam profile directly or something)')
        }
        logger.ok('Command execution over')
    }
} satisfies SlashCommand
