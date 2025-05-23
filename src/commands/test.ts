import { Logger } from '../util/logger'
const logger = new Logger('/test')

import { SlashCommandBuilder, type GuildMember, ApplicationIntegrationType, type ChatInputCommandInteraction } from 'discord.js'
import { BotInstallationType, SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command'),
    async execute(context) {
        const isAnInteraction = !!context.interaction

        // --- START DEBUGGING LOGS (KEEP THESE FOR FUTURE REFERENCE IF NEEDED) ---
        logger.debug('--- TEST COMMAND DEBUG ---')
        logger.debug(`Invoked in Guild ID (from context.guild getter): ${context.guild?.id || 'N/A (null)'}`)
        logger.debug(`Invoked in Channel ID (from context.channel getter): ${context.channel?.id || 'N/A (null)'}`)
        logger.debug(`Is an Interaction: ${isAnInteraction}`)

        if (isAnInteraction && context.interaction) {
            logger.debug(`  Interaction Type: ${context.interaction.type}`)
            logger.debug(`  Interaction Guild ID (raw interaction.guildId): ${context.interaction.guildId || 'N/A (null)'}`)
            logger.debug(`  Interaction Channel ID (raw interaction.channelId): ${context.interaction.channelId || 'N/A (null)'}`)

            const authOwners = context.interaction.authorizingIntegrationOwners as { [key: number]: string } | undefined

            logger.debug(`  Type of authorizingIntegrationOwners: ${typeof authOwners}`)
            if (authOwners) {
                logger.debug(`  Object.keys for authOwners: ${Object.keys(authOwners).map(Number).join(',')}`)
                logger.debug(`  Does keys.includes(0 / GuildInstall): ${Object.prototype.hasOwnProperty.call(authOwners, ApplicationIntegrationType.GuildInstall)}`)
                logger.debug(`  Does keys.includes(1 / UserInstall): ${Object.prototype.hasOwnProperty.call(authOwners, ApplicationIntegrationType.UserInstall)}`)
            } else {
                logger.debug(`  authorizingIntegrationOwners is undefined/null.`)
            }
        } else if (context.message) {
            logger.debug(`  Message Guild ID (raw from message.guild): ${context.message.guild?.id || 'N/A (null)'}`)
            logger.debug(`  Message Channel ID (raw from message.channel): ${context.message.channel?.id || 'N/A (null)'}`)
        }
        // --- END DEBUGGING LOGS ---


        let installationType: BotInstallationType = BotInstallationType.Unknown

        if (!isAnInteraction) {
            // Logic 1: Message Command -> Must be Guild Install
            installationType = BotInstallationType.GuildInstall
        } else { // It is a Slash Command Interaction
            const interaction = context.interaction as ChatInputCommandInteraction

            // Logic 2: Slash Command - Check if it's a DM/Group DM or a Guild
            if (!interaction.guildId) {
                // No raw guildId means it's a DM/Group DM context for a slash command
                installationType = BotInstallationType.UserInstallDM
            } else {
                // Raw guildId is present, so the command was run in a guild channel.
                // Now, distinguish between Guild Install and User Install *within this guild*.
                // The key here is whether the bot exists as a member in this guild.
                if (context.guild) { // Check if the full Guild object is available (implies bot might be in cache or fetchable)
                    let botMember: GuildMember | undefined | null = context.guild.members.cache.get(context.client.user!.id)
                    if (!botMember) {
                        try {
                            // Attempt to fetch if not in cache. Requires GUILD_MEMBERS intent.
                            // This fetch will only succeed if the bot is actually in the guild and has intent.
                            // If it's a user-installed command in a guild where bot isn't member, this will likely fail or return null.
                            botMember = await context.guild.members.fetch(context.client.user!.id)
                        } catch {
                            // Error likely means bot is not in guild or permissions/intents issue.
                            // Treat as bot member not found for this purpose.
                            botMember = null
                        }
                    }

                    if (botMember) {
                        // Logic 3a: In a guild, and bot is found as a member. This is a Guild Install.
                        // This handles the scenario where the bot is both Guild & User installed correctly.
                        installationType = BotInstallationType.GuildInstall
                    } else {
                        // Logic 3b: In a guild (guildId present), but bot is NOT found as a member.
                        // This means the command was executed via user-install permission.
                        installationType = BotInstallationType.UserInstallGuild
                    }
                } else {
                    // Logic 3c: interaction.guildId present, but context.guild is null.
                    // As observed in logs, this happens for user-installed commands in guilds.
                    // Since guildId exists but bot isn't a member (implied by null context.guild),
                    // it must be a User Install in a guild context.
                    logger.debug(`{test command} Discrepancy: interaction.guildId present (${interaction.guildId}), but context.guild null. Classifying as User install (Guild).`)
                    installationType = BotInstallationType.UserInstallGuild
                }
            }
        }

        logger.debug(`Final determined installationType: ${installationType}`)
        logger.debug('--- END TEST COMMAND DEBUG ---')

        await context.reply(`Test command executed\n-# - Likely bot installation type: ${installationType}`)
    }
} satisfies SlashCommand
