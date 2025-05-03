import { ApplicationCommandType, ContextMenuCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js'
import { ContextMenuCommand } from '../types/types'
import { inspect } from 'util'

export const contextMenuCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Remove bot reply')
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel),
    type: ApplicationCommandType.Message,
    async execute(interaction, { reply, client }) {
        try {
            const channel = interaction.targetMessage.channel
            const message = await channel.messages.fetch(interaction.targetMessage.id)
            if (message.author.id !== client.user.id) {
                await reply({
                    content: '❌ This command can only be used on this bot\'s interaction replies',
                    flags: MessageFlags.Ephemeral
                })
                return
            }
            if (!message.interactionMetadata) {
                await reply({
                    content: '❌ This context command can only be used on interaction replies of this bot',
                    flags: MessageFlags.Ephemeral
                })
                return
            }
            if (message.interactionMetadata.user.id !== interaction.user.id) {
                await reply({
                    content: '❌ You can only delete your own interaction replies',
                    flags: MessageFlags.Ephemeral
                })
                return
            }

            await message.delete()
            await reply({
                content: '✅ Deleted the bot reply',
                flags: MessageFlags.Ephemeral
            })
        } catch (error) {
            console.error('Error removing bot reply:', error)
            await reply({
                content: `❌ Error:\n${error instanceof Error ? error.stack ?? error.message : inspect(error)})`,
                flags: MessageFlags.Ephemeral
            })
        }
    }
} satisfies ContextMenuCommand<ApplicationCommandType.Message>
