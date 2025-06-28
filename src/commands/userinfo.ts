import { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, EmbedBuilder } from 'discord.js'
import { ContextMenuCommand, SlashCommand, BotInstallationType } from '../types'
import { getUserAvatar } from '../util/functions'

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
        const targetUser = await context.getUserOption('user', false, context.user)
        const installationType = await context.getInstallationType()

        const userComponents = [
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true),
            new ContainerBuilder()
                .setAccentColor(3447003)
                .addSectionComponents(new SectionBuilder()
                    .setThumbnailAccessory(
                        new ThumbnailBuilder()
                            .setURL(getUserAvatar(targetUser, null, { size: 256 }))
                            .setDescription(`Global avatar for user \`${targetUser.username}\``)
                    ).addTextDisplayComponents(
                        new TextDisplayBuilder().setContent("## User information"),
                        new TextDisplayBuilder().setContent(`Username: \`${targetUser.username}\`${targetUser.discriminator !== '0' ? `\nUser tag: \`${targetUser.tag}\`` : ''}\nDisplay name: \`${targetUser.displayName}\``)
                    )
                ).addTextDisplayComponents(new TextDisplayBuilder()
                    .setContent(`**Account created:**\n<t:${Math.floor(targetUser.createdTimestamp / 1000)}>\n(<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>)`)
                ).addTextDisplayComponents(new TextDisplayBuilder()
                    .setContent(`ID: \`${targetUser.id}\``)
                ).addSectionComponents(new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder()
                        .setContent("Bot account?")
                    ).setButtonAccessory(new ButtonBuilder()
                        .setStyle(targetUser.bot ? ButtonStyle.Success : ButtonStyle.Danger)
                        .setLabel(targetUser.bot ? "Yes" : "No")
                        .setEmoji({ name: targetUser.bot ? "✅" : "❌" })
                        .setDisabled(true)
                        .setCustomId(targetUser.bot ? "bot-account-yes" : "bot-account-no")
                    )
                ).addSeparatorComponents(new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                ).addTextDisplayComponents(new TextDisplayBuilder()
                    .setContent("### User flags"),
                ).addTextDisplayComponents(new TextDisplayBuilder()
                    .setContent(`\`${targetUser.flags?.toArray().join('`, `') || 'None'}\``)
                ),
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
        ]

        if (installationType === BotInstallationType.GuildInstall && context.guild) {
            const member = context.guild.members.cache.get(targetUser.id) || await context.guild.members.fetch(targetUser.id).catch(() => null)
            if (member) {
                userComponents.push(
                    new ContainerBuilder()
                        .setAccentColor(3447003)
                        .addSectionComponents(new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent("## Member information"),
                                new TextDisplayBuilder().setContent(`Display name: \`${member.displayName}\``)
                            ).setThumbnailAccessory(new ThumbnailBuilder()
                                .setURL(getUserAvatar(targetUser, context.guild, { size: 256 }))
                                .setDescription(`Server avatar for user \`${targetUser.username}\``)
                            )
                        ).addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent(`**Joined server:**\n<t:${Math.floor(member.joinedTimestamp! / 1000)}>\n(<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>)`)
                        ).addSectionComponents(new SectionBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder()
                                .setContent("Server booster?")
                            ).setButtonAccessory(new ButtonBuilder()
                                .setStyle(member.premiumSince ? ButtonStyle.Success : ButtonStyle.Danger)
                                .setLabel(member.premiumSince ? "Yes" : "No")
                                .setEmoji({ name: member.premiumSince ? "✅" : "❌" })
                                .setDisabled(true)
                                .setCustomId(member.premiumSince ? "server-booster-yes" : "server-booster-no")
                            )
                        ).addSeparatorComponents(new SeparatorBuilder()
                            .setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                        ).addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent("### Roles")
                        ).addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent(member.roles.cache.size > 1
                                ? member.roles.cache.filter(role => role.id !== context.guild!.id).map(role => `<@&${role.id}>`).join(', ')
                                : 'None'
                            )
                        ).addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent(`-# * 🎖️ ${Math.floor((member.roles.cache.size / context.guild.roles.cache.size) * 100)}% of the roles on the server (${member.roles.cache.size} / ${context.guild.roles.cache.size})`)
                        ).addSeparatorComponents(new SeparatorBuilder()
                            .setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                        ).addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent("### Member flags"),
                        ).addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent(`\`${member.flags?.toArray().join('`, `') || 'None'}\``)
                        ),
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
                )
            }
        }

        await context.reply({
            components: userComponents,
            flags: MessageFlags.IsComponentsV2
        })
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
                { name: 'Display Name', value: `${targetUser.displayName}${!targetUser.bot && targetUser.discriminator !== '0' ? ` (#${targetUser.discriminator})` : ''}`, inline: true },
                { name: 'User ID', value: targetUser.id, inline: true },
                { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
            )
        const member = guild?.members?.cache.get(targetUser.id)
        if (guild && member) {
            embed.addFields(
                { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>`, inline: true },
                { name: 'Nickname', value: member.nickname ?? 'None', inline: true },
                { name: 'Roles', value: member.roles.cache.size > 1
                    ? member.roles.cache.filter(role => role.id !== guild.id).map(role => `<@&${role.id}>`).join(', ')
                    : 'None'
                }
            )
        }
        await reply({ embeds: [embed] })
    }
} satisfies ContextMenuCommand<ApplicationCommandType.User>
