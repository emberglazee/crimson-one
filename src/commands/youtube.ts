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
            .setDescription('Interact with YouTube comments.')
            .addSubcommand(subcommand => subcommand
                .setName('newest')
                .setDescription('Get the newest comment from a YouTube video.')
                .addStringOption(option => option
                    .setName('youtube_video_url')
                    .setDescription('The URL of the YouTube video.')
                    .setRequired(true)
                )
            ).addSubcommand(subcommand => subcommand
                .setName('earliest')
                .setDescription('Get the earliest comment from a YouTube video.')
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

        const subcommandGroup = ctx.getSubcommandGroup()
        if (subcommandGroup !== 'comment') {
            await ctx.reply('❌ Invalid subcommand group.')
            return
        }

        await ctx.deferReply()

        const videoUrl = ctx.getStringOption('youtube_video_url', true)
        const videoId = extractVideoId(videoUrl)

        if (!videoId) {
            await ctx.editReply('❌ Invalid YouTube video URL.')
            return
        }

        const youtube = google.youtube({
            version: 'v3',
            auth: YOUTUBE_API_KEY
        })

        const subcommand = ctx.getSubcommand()
        if (subcommand === 'newest') {
            try {
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
        } else if (subcommand === 'earliest') {
            try {
                const videoResponse = await youtube.videos.list({
                    part: ['statistics'],
                    id: [videoId]
                })

                const commentCount = parseInt(videoResponse.data.items?.[0]?.statistics?.commentCount ?? '0')

                if (commentCount > 20000) {
                    await ctx.editReply('❌ This video has too many (>20,000) comments to fetch the earliest one. This is a bot limitation to prevent excessive API usage.')
                    return
                }

                if (commentCount === 0) {
                    await ctx.editReply('No comments found on this video.')
                    return
                }

                const firstPage = await youtube.commentThreads.list({
                    part: ['snippet'],
                    videoId: videoId,
                    order: 'time',
                    maxResults: 100
                })

                if (!firstPage.data.items || firstPage.data.items.length === 0) {
                    await ctx.editReply('No comments found on this video.')
                    return
                }

                let lastResponse = firstPage
                let nextPageToken: string | null | undefined = firstPage.data.nextPageToken

                // Paginate to the last page
                // The API returns pages newest to oldest, so the last page contains the oldest comments.
                while (nextPageToken) {
                    const response = await youtube.commentThreads.list({
                        part: ['snippet'],
                        videoId: videoId,
                        order: 'time',
                        maxResults: 100,
                        pageToken: nextPageToken
                    })

                    if (!response.data.items || response.data.items.length === 0) {
                        break
                    }

                    lastResponse = response
                    nextPageToken = response.data.nextPageToken
                }

                // The last item on the last page is the oldest
                if (!lastResponse.data.items) {
                    await ctx.editReply('Could not find any comments.')
                    return
                }
                const commentThread = lastResponse.data.items[lastResponse.data.items.length - 1]
                if (!commentThread) {
                    await ctx.editReply('Could not find the earliest comment.')
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
