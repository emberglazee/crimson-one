import { EmbedBuilder, SlashCommandBuilder, type ImageExtension, type ImageSize } from 'discord.js'
import { SlashCommand } from '../types'
import { BotInstallationType } from '../types'
import { smallFooterNote } from '../util/functions'

const avatarExtensionOptions = [
    { name: 'GIF', value: 'gif' },
    { name: 'WEBP', value: 'webp' },
    { name: 'PNG', value: 'png' },
    { name: 'JPEG', value: 'jpg' }
] as const
const avatarSizes = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096] as const
const avatarSizeOptions = avatarSizes.map(size => ({ name: `${size}px` as const, value: size }))

export default {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s profile picture')
        .addUserOption(uo => uo
            .setName('user')
            .setDescription('User to show their avatar of (default: yourself)')
            .setRequired(false)
        ).addBooleanOption(bo => bo
            .setName('raw')
            .setDescription('Send as a raw message? (default: false)')
            .setRequired(false)
        ).addStringOption(so => so
            .setName('extension')
            .setDescription('Image format to get the avatar in (default: PNG, if avatar is animated, pick GIF)')
            .addChoices(...avatarExtensionOptions)
            .setRequired(false)
        ).addNumberOption(no => no
            .setName('size')
            .setDescription('Avatar size (default: 1024)')
            .addChoices(...avatarSizeOptions)
            .setRequired(false)
        ).addStringOption(so => so
            .setName('serverorglobal')
            .setDescription('Should the avatar be from the server or global? (default: server/guild, unless not in a server)')
            .addChoices(
                { name: 'Server', value: 'guild' },
                { name: 'Global', value: 'global' }
            ).setRequired(false)
        ),

    async execute(context) {
        const user = await context.getUserOption('user', false, context.author)
        const raw = context.getBooleanOption('raw', false, false)
        const ext = context.getStringOption('extension', false, 'png') as ImageExtension
        const size = context.getIntegerOption('size', false, 1024) as ImageSize
        const guildOrGlobal = context.getStringOption('serverorglobal', false, 'guild')

        await context.deferReply()

        let avatar = ''
        const installationType = await context.getInstallationType()
        let footerNote: string | null = null

        if (guildOrGlobal === 'guild') {
            if (installationType === BotInstallationType.GuildInstall || installationType === BotInstallationType.UserInstallGuild) {
                if (context.guild) {
                    try {
                        const member = await context.guild.members.fetch(user.id)
                        avatar = member.displayAvatarURL({ extension: ext, size: size })
                    } catch {
                        avatar = user.displayAvatarURL({ extension: ext, size: size })
                        footerNote = 'Error fetching the guild member, showing user\'s global avatar.'
                    }
                } else {
                    avatar = user.displayAvatarURL({ extension: ext, size: size })
                    footerNote = 'Could not access server information, showing global avatar.'
                }
            } else {
                avatar = user.displayAvatarURL({ extension: ext, size: size })
                if (installationType === BotInstallationType.UserInstallDM) {
                    footerNote = 'Showing global avatar (command ran in DM).'
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
            await context.reply(response)
            return
        }

        let titlePrefix = 'Global'
        if (guildOrGlobal === 'guild' && !footerNote) {
            titlePrefix = 'Server'
        }

        const embed = new EmbedBuilder()
            .setTitle(`${titlePrefix} avatar of ${user.username}`)
            .setImage(avatar)
            .setColor('#F96302')

        if (footerNote) {
            embed.setFooter({ text: footerNote })
        }

        await context.reply({
            embeds: [embed]
        })
    }
} satisfies SlashCommand
