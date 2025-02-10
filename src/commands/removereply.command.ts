import { ApplicationCommandType, ContextMenuCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js'
import type { ContextMenuCommand } from '../modules/CommandManager'

export const contextMenuCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Remove bot reply')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    type: ApplicationCommandType.Message,
    async execute(interaction) {
        if (interaction.targetMessage.author.id !== interaction.client.user.id) {
            await interaction.reply({
                content: '❌ This command can only be used on this bot\'s interaction replies',
                flags: MessageFlags.Ephemeral
            })
            return
        }
        if (!interaction.targetMessage.interactionMetadata) {
            await interaction.reply({
                content: '❌ This context command can only be used on interaction replies of this bot',
                flags: MessageFlags.Ephemeral
            })
            return
        }
        if (interaction.targetMessage.interactionMetadata.user.id !== interaction.user.id) {
            await interaction.reply({
                content: '❌ You can only delete your own interaction replies',
                flags: MessageFlags.Ephemeral
            })
            return
        }

        await interaction.targetMessage.delete()
        await interaction.reply({
            content: '✅ Deleted the bot reply',
            flags: MessageFlags.Ephemeral
        })
    }
} satisfies ContextMenuCommand<ApplicationCommandType.Message>
