import { EmbedBuilder, SlashCommandBuilder, type ImageExtension, type ImageSize } from 'discord.js'
import { SlashCommand } from '../types/types'

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
            .setChoices(
                { name: 'GIF', value: 'gif' },
                { name: 'WEBP', value: 'webp' },
                { name: 'PNG', value: 'png' },
                { name: 'JPEG', value: 'jpg' }
            ).setRequired(false)
        ).addNumberOption(no => no
            .setName('size')
            .setDescription('Avatar size (default: 1024)')
            .setChoices(
                { name: '16', value: 16 },
                { name: '32', value: 32 },
                { name: '64', value: 64 },
                { name: '128', value: 128 },
                { name: '256', value: 256 },
                { name: '512', value: 512 },
                { name: '1024', value: 1024 },
                { name: '2048', value: 2048 },
                { name: '4096', value: 4096 }
            ).setRequired(false)
        ).addStringOption(so => so
            .setName('serverorglobal')
            .setDescription('Should the avatar be from the server or global? (default: server/guild, unless not in a server)')
            .addChoices(
                { name: 'Server', value: 'guild' },
                { name: 'Global', value: 'global' }
            ).setRequired(false)
        ),

    async execute(context) {
        const user = await context.getUserOption('user', false) ?? context.user
        const raw = await context.getBooleanOption('raw', false) ?? false
        const ext = await context.getStringOption('extension', false) as ImageExtension ?? 'png'
        const size = await context.getNumberOption('size', false) as ImageSize ?? 1024
        const guildOrGlobal = await context.getStringOption('serverorglobal', false) ?? 'guild'

        let avatar = ''
        if (guildOrGlobal === 'guild') {
            if (!context.guild) {
                // not in a guild, using global avatar instead
                avatar = user.displayAvatarURL({ extension: ext, size: size })
            } else {
                const member = await context.guild.members.fetch(user.id)
                if (!member) await context.reply('❌ User not found in this server')
                avatar = member.displayAvatarURL({ extension: ext, size: size })
            }
        } else if (guildOrGlobal === 'global') {
            avatar = user.displayAvatarURL({ extension: ext, size: size })
        }
        let response = avatar
        if (guildOrGlobal === 'guild' && !context.guild) {
            response += '\n-# This is the global avatar, as the command was ran outside a server'
        }
        if (raw) {
            await context.reply(response)
            return
        }
        const embed = new EmbedBuilder()
            .setTitle(`Avatar of ${user.username}`)
            .setImage(avatar)
            .setColor('#F96302')
        if (guildOrGlobal === 'guild' && !context.guild) {
            embed.setFooter({
                text: 'This is the global avatar, as the command was ran outside a server'
            })
        }
        await context.reply({
            embeds: [embed]
        })
    }
} satisfies SlashCommand
