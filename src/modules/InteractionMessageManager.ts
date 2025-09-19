import { Logger } from './Logger'
import { red, yellow } from '../util/colors'
const logger = new Logger('InteractionMessageManager')

import { type CommandContext } from './CommandManager/CommandContext'
import { type Message, type MessageEditOptions } from 'discord.js'

// Class to handle message updating with fallback support
export class InteractionMessageManager {
    private context: CommandContext
    private followUpMessagePromise: Promise<Message | null> | null = null
    private followUpMessage: Message | null = null
    private useFollowUp = false

    constructor(context: CommandContext) {
        this.context = context
    }

    // Switch to using follow-up message
    public switchToFollowUp(): void {
        if (this.useFollowUp) return
        this.useFollowUp = true
        this.followUpMessagePromise = this.createFollowUpMessage()
    }

    private async createFollowUpMessage(): Promise<Message | null> {
        try {
            // First update the original message to inform users
            await this.context.editReply(
                '⏳ Operation in progress...\n' +
                '⚠️ *This is taking longer than 14 minutes. Real-time updates will continue in a follow-up message.*'
            ).catch((err: Error) => {
                logger.warn(`Failed to update original message about timeout: ${red(err.message)}`)
            })

            // Create a follow-up message that we'll update from now on
            const followUp = await this.context.followUp('🔄 Continuing operation...\nUpdates will now appear in this message.')

            // If followUp returns void (text command), just return null
            if (!followUp || typeof followUp !== 'object' || !('edit' in followUp)) {
                logger.warn('Follow-up message could not be created (likely a text command).')
                return null
            }

            this.followUpMessage = followUp as Message
            logger.ok(`Created follow-up message with ID ${yellow((followUp as Message).id)}`)
            return followUp as Message
        } catch (error) {
            logger.warn(`Failed to create follow-up message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            return null
        }
    }

    public async updateMessage(content: string | MessageEditOptions): Promise<void> {
        try {
            if (this.useFollowUp) {
                // Make sure we have a follow-up message
                if (this.followUpMessagePromise && !this.followUpMessage) {
                    this.followUpMessage = await this.followUpMessagePromise
                }

                if (this.followUpMessage) {
                    await this.followUpMessage.edit(content)
                } else {
                    // Fallback if follow-up message creation failed (e.g., text command)
                    await this.context.editReply(content).catch(() => {}) // Added empty catch to prevent unhandled promise rejection
                }
            } else {
                await this.context.editReply(content)
            }
        } catch (error) {
            logger.warn(`Failed to update message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
        }
    }

    public get isUsingFollowUp(): boolean {
        return this.useFollowUp
    }

    public async sendFinalMessage(options: MessageEditOptions): Promise<void> {
        try {
            if (this.useFollowUp) {
                // Ensure we have the follow-up message before trying to edit it
                if (this.followUpMessagePromise && !this.followUpMessage) {
                    this.followUpMessage = await this.followUpMessagePromise
                }

                if (this.followUpMessage) {
                    await this.followUpMessage.edit(options)
                } else {
                    // This case means we intended to use a follow-up, but it failed to create.
                    // The original interaction is likely expired, so we throw to trigger the catch block's follow-up.
                    throw new Error('Follow-up message not available for final update.')
                }
            } else {
                await this.context.editReply(options)
            }
        } catch (error) {
            // If both methods fail, try to send a new follow-up message with the results
            logger.debug(`Failed to send final message, attempting follow-up final message: ${red(error instanceof Error ? error.message : 'Unknown error')}`)
            try {
                await this.context.followUp({
                    content: options.content ?? undefined,
                    embeds: options.embeds,
                    allowedMentions: options.allowedMentions
                })
            } catch (finalError) {
                logger.warn(`Failed to send any completion message: ${red(finalError instanceof Error ? finalError.message : 'Unknown error')}`)
            }
        }
    }
}
