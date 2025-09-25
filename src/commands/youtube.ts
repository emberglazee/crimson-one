import { SlashCommand } from '../types'
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { google } from 'googleapis'

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY

function parseYoutubeTimestamps(text: string): string {
    const regex = /<a href="([^"]+)">([^<]+)<\/a>/g
    return text.replace(regex, (_match, url, linkText) => {
        const decodedUrl = url.replace(/&amp;/g, '&')
        return `[${linkText}](${decodedUrl})`
    })
}

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
                const [videoResponse, commentThreadResponse] = await Promise.all([
                    youtube.videos.list({
                        part: ['snippet'],
                        id: [videoId]
                    }),
                    youtube.commentThreads.list({
                        part: ['snippet'],
                        videoId: videoId,
                        order: 'time',
                        maxResults: 2
                    })
                ])

                if (!commentThreadResponse.data.items || commentThreadResponse.data.items.length === 0) {
                    await ctx.editReply('No comments found on this video.')
                    return
                }

                const video = videoResponse.data.items?.[0]
                if (!video?.snippet) {
                    await ctx.editReply('Could not retrieve video details.')
                    return
                }

                let commentThread = commentThreadResponse.data.items[0]

                // If there are two comments, check if the first one is older than the second.
                // If so, it's likely a pinned comment, and the second one is the actual newest.
                if (commentThreadResponse.data.items.length > 1) {
                    const firstComment = commentThreadResponse.data.items[0].snippet?.topLevelComment?.snippet
                    const secondComment = commentThreadResponse.data.items[1].snippet?.topLevelComment?.snippet

                    if (firstComment?.publishedAt && secondComment?.publishedAt) {
                        const firstDate = new Date(firstComment.publishedAt)
                        const secondDate = new Date(secondComment.publishedAt)
                        if (firstDate < secondDate) {
                            commentThread = commentThreadResponse.data.items[1]
                        }
                    }
                }

                const comment = commentThread.snippet?.topLevelComment?.snippet
                if (!comment) {
                    await ctx.editReply('Could not retrieve comment details.')
                    return
                }

                const videoEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: video.snippet.channelTitle ?? 'Unknown Channel',
                        url: `https://www.youtube.com/channel/${video.snippet.channelId}`
                    })
                    .setTitle(`[${video.snippet.title ?? 'Unknown Video'}](https://youtu.be/${videoId})`)
                    .setURL(videoUrl)
                    .setThumbnail(video.snippet.thumbnails?.default?.url ?? null)
                    .setColor('#FF0000')

                const commentEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: comment.authorDisplayName ?? 'Unknown Author',
                        iconURL: comment.authorProfileImageUrl ?? undefined,
                        url: comment.authorChannelUrl ?? undefined
                    })
                    .setDescription(comment.textDisplay ? parseYoutubeTimestamps(comment.textDisplay) : '')
                    .setFooter({ text: `https://www.youtube.com/watch?v=${videoId}&lc=${commentThread.id}` })
                    .setTimestamp(new Date(comment.publishedAt ?? Date.now()))
                    .setColor('#FF0000')

                await ctx.editReply({ embeds: [videoEmbed, commentEmbed] })

            } catch (error) {
                console.error('Error fetching YouTube comment:', error)
                await ctx.editReply('❌ An error occurred while fetching the comment.')
            }
        } else if (subcommand === 'earliest') {
            try {
                const videoResponse = await youtube.videos.list({
                    part: ['snippet', 'statistics'],
                    id: [videoId]
                })

                const video = videoResponse.data.items?.[0]
                if (!video || !video.snippet || !video.statistics) {
                    await ctx.editReply('Could not retrieve video details.')
                    return
                }

                const commentCount = parseInt(video.statistics.commentCount ?? '0')

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

                const videoEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: video.snippet.channelTitle ?? 'Unknown Channel',
                        url: `https://www.youtube.com/channel/${video.snippet.channelId}`
                    })
                    .setTitle(`[${video.snippet.title ?? 'Unknown Video'}](https://youtu.be/${videoId})`)
                    .setURL(videoUrl)
                    .setThumbnail(video.snippet.thumbnails?.default?.url ?? null)
                    .setColor('#FF0000')

                const commentEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: comment.authorDisplayName ?? 'Unknown Author',
                        iconURL: comment.authorProfileImageUrl ?? undefined,
                        url: comment.authorChannelUrl ?? undefined
                    })
                    .setDescription(comment.textDisplay ? parseYoutubeTimestamps(comment.textDisplay) : '')
                    .setFooter({ text: `https://www.youtube.com/watch?v=${videoId}&lc=${commentThread.id}` })
                    .setTimestamp(new Date(comment.publishedAt ?? Date.now()))
                    .setColor('#FF0000')

                await ctx.editReply({ embeds: [videoEmbed, commentEmbed] })

            } catch (error) {
                console.error('Error fetching YouTube comment:', error)
                await ctx.editReply('❌ An error occurred while fetching the comment.')
            }
        }
    }
} satisfies SlashCommand

function extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(regex)
    return match ? match[1] : null
}
