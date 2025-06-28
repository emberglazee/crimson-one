import { SlashCommandBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, SectionBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, ContextMenuCommandBuilder, InteractionContextType, ApplicationCommandType, EmbedBuilder } from 'discord.js'
import { SlashCommand, BotInstallationType, ContextMenuCommand } from '../types'
import { absoluteDiscordTimestamp, getUserAvatar, relativeDiscordTimestamp } from '../util/functions'

export const slashCommand = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Shows information about a user')
        .addSubcommand(sc => sc
            .setName('info')
            .setDescription('Shows information about a user')
            .addUserOption(uo => uo
                .setName('user')
                .setDescription('The user to get info about (defaults to yourself)')
                .setRequired(false)
            )
        ),
    async execute(context) {
        const subcommand = context.getSubcommand()

        if (subcommand === 'info') {
            // the indentation paradise

            const targetUser = await context.getUserOption('user', false, context.user)
            const installationType = await context.getInstallationType()
            const { bot } = targetUser

            const usernameText = (
                `${targetUser.discriminator === '0'
                    ? `Username: \`${targetUser.username}\``
                    : `User tag: \`${targetUser.tag}\``}\n` +
                `Display name: \`${targetUser.displayName}\``
            )

            const accountCreatedText = (
                `**Account created:**\n` +
                `${absoluteDiscordTimestamp(Math.floor(targetUser.createdTimestamp / 1000))}\n` +
                `(${relativeDiscordTimestamp(Math.floor(targetUser.createdTimestamp / 1000))})`
            )

            const userComponents = [
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
                    .setDivider(true),

                new ContainerBuilder()
                    .setAccentColor(targetUser.accentColor ?? 3447003)
                    .addSectionComponents(

                        new SectionBuilder()
                            .addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent('## User information'),

                                new TextDisplayBuilder()
                                    .setContent(usernameText)

                            ).setThumbnailAccessory(

                                new ThumbnailBuilder()
                                    .setURL(getUserAvatar(targetUser, null, { size: 256 }))
                                    .setDescription(`Global avatar for user \`${targetUser.username}\``)

                            )

                    ).addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(accountCreatedText)

                    ).addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(`ID: \`${targetUser.id}\``)

                    ).addSectionComponents(

                        new SectionBuilder()
                            .addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent('Bot account?')

                            ).setButtonAccessory(

                                new ButtonBuilder()
                                    .setStyle(
                                        bot ? ButtonStyle.Success : ButtonStyle.Danger
                                    ).setLabel(
                                        bot ? 'Yes' : 'No'
                                    ).setEmoji(
                                        bot ? '✅' : '❌'
                                    ).setCustomId(
                                        bot ? 'bot-account-yes' : 'bot-account-no'
                                    ).setDisabled(true)

                            )

                    ).addSeparatorComponents(

                        new SeparatorBuilder()
                            .setSpacing(SeparatorSpacingSize.Small)
                            .setDivider(true)

                    ).addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent('### User flags'),

                    ).addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(`\`${targetUser.flags?.toArray().join('`, `') || 'None'}\``)

                    ),

                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Large)
                    .setDivider(true)
            ]

            if (installationType === BotInstallationType.GuildInstall && context.guild) {

                const member = context.guild.members.cache.get(targetUser.id) || await context.guild.members.fetch(targetUser.id).catch(() => null)
                if (member) {

                    const joinedServerText = (
                        `**Joined server:**\n` +
                        `${absoluteDiscordTimestamp(Math.floor(member.joinedTimestamp! / 1000))}\n` +
                        `(${relativeDiscordTimestamp(Math.floor(member.joinedTimestamp! / 1000))})`
                    )

                    const memberRoleCount = member.roles.cache.size,
                        guildRoleCount = context.guild.roles.cache.size
                    const roleCountText = (
                        `-# * 🎖️ ${Math.floor((memberRoleCount / guildRoleCount) * 100)}% of the roles on the server (${memberRoleCount} / ${guildRoleCount})`
                    )

                    const boosting = !!member.premiumSince

                    userComponents.push(
                        new ContainerBuilder()
                            .setAccentColor(member.displayColor)
                            .addSectionComponents(

                                new SectionBuilder()
                                    .addTextDisplayComponents(

                                        new TextDisplayBuilder()
                                            .setContent('## Member information'),
                                        new TextDisplayBuilder()
                                            .setContent(`Display name: \`${member.displayName}\``)

                                    ).setThumbnailAccessory(

                                        new ThumbnailBuilder()
                                            .setURL(getUserAvatar(targetUser, context.guild, { size: 256 }))
                                            .setDescription(`Server avatar for user \`${targetUser.username}\``)

                                    )

                            ).addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent(joinedServerText)

                            ).addSectionComponents(

                                new SectionBuilder()
                                    .addTextDisplayComponents(

                                        new TextDisplayBuilder()
                                            .setContent('Server booster?')

                                    ).setButtonAccessory(

                                        new ButtonBuilder()
                                            .setStyle(
                                                boosting ? ButtonStyle.Success : ButtonStyle.Danger
                                            ).setLabel(
                                                boosting ? 'Yes' : 'No'
                                            ).setEmoji(
                                                boosting ? '✅' : '❌'
                                            ).setCustomId(
                                                boosting ? 'server-booster-yes' : 'server-booster-no'
                                            ).setDisabled(true)

                                    )

                            ).addSeparatorComponents(

                                new SeparatorBuilder()
                                    .setSpacing(SeparatorSpacingSize.Small)
                                    .setDivider(true)

                            ).addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent('### Roles')

                            ).addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent(member.roles.cache.size > 1
                                        ? member.roles.cache.filter(role => role.id !== context.guild!.id).map(role => `<@&${role.id}>`).join(', ')
                                        : 'None'
                                    )

                            ).addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent(roleCountText)

                            ).addSeparatorComponents(

                                new SeparatorBuilder()
                                    .setSpacing(SeparatorSpacingSize.Small)
                                    .setDivider(true)

                            ).addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent('### Member flags'),

                            ).addTextDisplayComponents(

                                new TextDisplayBuilder()
                                    .setContent(`\`${member.flags?.toArray().join('`, `') || 'None'}\``)

                            ),

                        new SeparatorBuilder()
                            .setSpacing(SeparatorSpacingSize.Large)
                            .setDivider(true)
                    )

                }

            }

            await context.reply({
                components: userComponents,
                flags: MessageFlags.IsComponentsV2
            })

        }
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
