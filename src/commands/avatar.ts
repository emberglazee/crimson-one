import { EmbedBuilder, SlashCommandBuilder, type ImageExtension, type ImageSize } from 'discord.js'
import { SlashCommand } from '../types'
import { BotInstallationType } from '../types'
import { smallFooterNote } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s profile picture')
        .addUserOption(option => option
            .setName('user')
            .setDescription('The user whose avatar you want to see (defaults to yourself).')
            .setRequired(false)
        ).addBooleanOption(option => option
            .setName('raw')
            .setDescription('Send as a raw message? (default: false)')
            .setRequired(false)
        ).addStringOption(option => option
            .setName('extension')
            .setDescription('Image format to get the avatar in')
            .addChoices(
                { name: 'GIF (choose for animated avatars)', value: 'gif' },
                { name: 'WEBP (low compatibility)', value: 'webp' },
                { name: 'PNG (default)', value: 'png' },
                { name: 'JPEG (compressed)', value: 'jpg' }
            ).setRequired(false)
        ).addNumberOption(option => option
            .setName('size')
            .setDescription('Avatar size in pixels')
            .addChoices(
                { name: '16px', value: 16 },
                { name: '32px', value: 32 },
                { name: '64px', value: 64 },
                { name: '128px', value: 128 },
                { name: '256px', value: 256 },
                { name: '512px', value: 512 },
                { name: '1024px (default)', value: 1024 },
                { name: '2048px', value: 2048 },
                { name: '4096px', value: 4096 }
            ).setRequired(false)
        ).addStringOption(option => option
            .setName('serverorglobal')
            .setDescription('Should the avatar be from the server or global?')
            .addChoices(
                { name: 'Server (default)', value: 'guild' },
                { name: 'Global', value: 'global' }
            ).setRequired(false)
        ),

    async execute(ctx) {
        const user = await ctx.getUserOption('user', false, ctx.author)
        const raw = ctx.getBooleanOption('raw', false, false)
        const ext = ctx.getStringOption('extension', false, 'png') as ImageExtension
        const size = ctx.getIntegerOption('size', false, 1024) as ImageSize
        const guildOrGlobal = ctx.getStringOption('serverorglobal', false, 'guild')

        await ctx.deferReply()

        let avatar = ''
        const installationType = ctx.getInstallationType()
        let footerNote: string | null = null

        if (guildOrGlobal === 'guild') {
            if (installationType === BotInstallationType.GuildInstall || installationType === BotInstallationType.UserInstallGuild) {
                if (ctx.guild) {
                    try {
                        const member = await ctx.guild.members.fetch(user.id)
                        avatar = member.displayAvatarURL({ extension: ext, size: size })
                    } catch {
                        avatar = user.displayAvatarURL({ extension: ext, size: size })
                        footerNote = 'Error fetching the guild member; showing the user\'s global avatar.'
                    }
                } else {
                    avatar = user.displayAvatarURL({ extension: ext, size: size })
                    footerNote = 'Could not access server information; showing the global avatar.'
                }
            } else {
                avatar = user.displayAvatarURL({ extension: ext, size: size })
                if (installationType === BotInstallationType.UserInstallDM) {
                    footerNote = 'Showing global avatar (command was run in a DM).'
                } else {
                    footerNote = 'Showing global avatar.'
                }
            }
        } else if (guildOrGlobal === 'global') {
            avatar = user.displayAvatarURL({ extension: ext, size: size })
        }

        let response = avatar
        if (footerNote) {
            response += `\n${smallFooterNote(footerNote)}`
        }

        if (raw) {
            await ctx.reply(response)
            return
        }

        let titlePrefix = 'Global'
        if (guildOrGlobal === 'guild' && !footerNote) {
            titlePrefix = 'Server'
        }

        const embed = new EmbedBuilder()
            .setTitle(`${titlePrefix} avatar for ${user.username}`)
            .setImage(avatar)
            .setColor('#F96302')

        if (footerNote) {
            embed.setFooter({ text: footerNote })
        }

        await ctx.reply({
            embeds: [embed]
        })
    }
} satisfies SlashCommand
