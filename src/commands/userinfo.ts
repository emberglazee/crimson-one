import { SlashCommandBuilder, EmbedBuilder, ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType } from 'discord.js'
import { ContextMenuCommand, SlashCommand } from '../types/types'

export const slashCommand = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Shows information about a user')
        .addUserOption(uo => uo
            .setName('user')
            .setDescription('The user to get info about (defaults to yourself)')
            .setRequired(false)
        ),
    async execute(context) {
        const targetUser = await context.getUserOption('user') ?? context.user
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('User Information')
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: 'Username', value: targetUser.username, inline: true },
                { name: 'User ID', value: targetUser.id, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
            )
        if (context.guild) {
            const member = context.guild.members.cache.get(targetUser.id)
            if (member) {
                embed.addFields(
                    { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>`, inline: true },
                    { name: 'Nickname', value: member.nickname ?? 'None', inline: true },
                    { name: 'Roles', value: member.roles.cache.size > 1
                        ? member.roles.cache.filter(role => role.id !== context.guild!.id).map(role => `<@&${role.id}>`).join(', ')
                        : 'None'
                    }
                )
            }
        }
        await context.reply({ embeds: [embed] })
    }
} satisfies SlashCommand

export const userContextMenuCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('User information')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    type: ApplicationCommandType.User,
    async execute({ reply, guild }, interaction) {
        const targetUser = interaction.targetUser
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('User Information')
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: 'Username', value: targetUser.username, inline: true },
                { name: 'User ID', value: targetUser.id, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
            )
        if (guild) {
            const member = guild.members.cache.get(targetUser.id)
            if (member) {
                embed.addFields(
                    { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>`, inline: true },
                    { name: 'Nickname', value: member.nickname ?? 'None', inline: true },
                    { name: 'Roles', value: member.roles.cache.size > 1
                        ? member.roles.cache.filter(role => role.id !== guild.id).map(role => `<@&${role.id}>`).join(', ')
                        : 'None'
                    }
                )
            }
        }
        await reply({ embeds: [embed] })
    }
} satisfies ContextMenuCommand<ApplicationCommandType.User>
