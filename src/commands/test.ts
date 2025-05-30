import { Logger } from '../util/logger'
const logger = new Logger('/test')

import { SlashCommandBuilder, ApplicationIntegrationType } from 'discord.js'
import { SlashCommand } from '../types/types'
import { smallFooterNote } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command'),
    async execute(context) {

        const isAnInteraction = !!context.interaction



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

        const installationType = await context.getInstallationType()
        logger.debug(`Final determined installation type by \`context.getInstallationType()\`: ${installationType}`)
        logger.debug('--- END TEST COMMAND DEBUG ---')



        const testContent = (
            'Test command executed\n' +
            `${smallFooterNote(`Likely bot installation type: ${installationType}`)}`
        )
        await context.reply(testContent)

    }
} satisfies SlashCommand
