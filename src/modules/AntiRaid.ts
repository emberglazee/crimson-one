
import { singleton } from 'tsyringe'
import { Logger } from './Logger'
import { red, yellow } from '../util/colors'
const logger = new Logger('AntiRaid')

import { type Message } from 'discord.js'
import { SOLITARY_CONFINEMENT_GUILD_ID } from '../util/constants'

@singleton()
export class AntiRaidManager {
    public constructor() {}

    public async init() {
        logger.ok('AntiRaid manager initialized.')
    }

    public async checkMessage(message: Message): Promise<void> {
        if (!message.guild || message.guild.id !== SOLITARY_CONFINEMENT_GUILD_ID || message.author.bot) {
            return
        }

        const member = message.member
        if (!member) return

        // 1. Account is less than 7 days old
        const accountAge = Date.now() - member.user.createdAt.getTime()
        const isNewAccount = accountAge < 7 * 24 * 60 * 60 * 1000
        if (!isNewAccount) return

        // 2. Message sent within a day of joining
        if (!member.joinedTimestamp) return
        const timeSinceJoin = Date.now() - member.joinedTimestamp
        const isNewMember = timeSinceJoin < 24 * 60 * 60 * 1000
        if (!isNewMember) return

        // 3. Message has exactly 4 attachments
        if (message.attachments.size !== 4) return

        // 4. All attachments are images
        const allAttachmentsAreImages = message.attachments.every(attachment => {
            const contentType = attachment.contentType
            return contentType?.startsWith('image/') ?? false
        })
        if (!allAttachmentsAreImages) return

        // If all conditions are met, ban the user.
        logger.warn(`Banning user ${yellow(member.user.tag)} (${member.id}) for suspected raid.`)
        try {
            await member.ban({
                reason: 'Automatic ban: Suspected userbot raid activity (new account posting 4 images shortly after joining).',
                deleteMessageSeconds: 60 * 60 * 24 * 7 // Delete messages from the last 7 days
            })
            logger.ok(`Successfully banned ${yellow(member.user.tag)}.`)
        } catch (error) {
            logger.error(`Failed to ban ${yellow(member.user.tag)}: ${red(error instanceof Error ? error.message : String(error))}`)
        }
    }
}
