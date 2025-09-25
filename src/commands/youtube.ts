import { SlashCommand } from '../types'
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { google } from 'googleapis'

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY

export default {
    data: new SlashCommandBuilder()
        .setName('youtube')
        .setDescription('Interact with YouTube.')
        .addSubcommandGroup(group => group
            .setName('comment')
            .setDescription('Get comments from a YouTube video.')
            .addSubcommand(subcommand => subcommand
                .setName('latest')
                .setDescription('Get the latest comment from a YouTube video.')
                .addStringOption(option => option
                    .setName('youtube_video_url')
                    .setDescription('The URL of the YouTube video.')
                    .setRequired(true)
                )
            )
        ),
    async execute(ctx) {
        if (!YOUTUBE_API_KEY) {
            await ctx.reply('❌ YouTube API key is not configured. Please contact the bot owner.')
            return
        }

        const subcommand = ctx.getSubcommand()
        if (subcommand === 'latest') {
            await ctx.deferReply()

            const videoUrl = ctx.getStringOption('youtube_video_url', true)
            const videoId = extractVideoId(videoUrl)

            if (!videoId) {
                await ctx.editReply('❌ Invalid YouTube video URL.')
                return
            }

            try {
                const youtube = google.youtube({
                    version: 'v3',
                    auth: YOUTUBE_API_KEY
                })

                const response = await youtube.commentThreads.list({
                    part: ['snippet'],
                    videoId: videoId,
                    order: 'time',
                    maxResults: 1
                })

                const commentThread = response.data.items?.[0]
                if (!commentThread) {
                    await ctx.editReply('No comments found on this video.')
                    return
                }

                const comment = commentThread.snippet?.topLevelComment?.snippet
                if (!comment) {
                    await ctx.editReply('Could not retrieve comment details.')
                    return
                }

                const embed = new EmbedBuilder()
                    .setTitle(comment.authorDisplayName ?? 'Unknown Author')
                    .setThumbnail(comment.authorProfileImageUrl ?? null)
                    .setDescription(comment.textDisplay ?? '')
                    .setFooter({ text: `https://www.youtube.com/watch?v=${videoId}&lc=${commentThread.id}` })
                    .setTimestamp(new Date(comment.publishedAt ?? Date.now()))
                    .setColor('#FF0000')

                await ctx.editReply({ embeds: [embed] })

            } catch (error) {
                console.error('Error fetching YouTube comment:', error)
                await ctx.editReply('❌ An error occurred while fetching the comment.')
            }
        }
    }
} satisfies SlashCommand

function extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(regex)
    return match ? match[1] : null
}
