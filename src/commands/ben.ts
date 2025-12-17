import { ChannelType, InteractionContextType, Message, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { BotInstallationType, type SlashCommand } from '../types'
import type { CommandContext } from '../modules'
import { chance, getRandomElement, sleep } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('ben')
        .setDescription('Talking Ben on Discord')
        .addSubcommand(subcommand => subcommand
            .setName('call')
            .setDescription('Start a call with Talking Ben')
        ).addSubcommand(subcommand => subcommand
            .setName('hangup')
            .setDescription('End the current call')
        ).setContexts(InteractionContextType.BotDM, InteractionContextType.Guild),
    async execute(ctx) {
        const subcommand = ctx.getSubcommand()
        if (subcommand === 'hangup') {
            if (!activeCalls.has(ctx.channel!.id)) {
                await ctx.reply({ content: 'Ben is not currently on a call in this channel.', flags: MessageFlags.Ephemeral })
                return
            }
            activeCalls.delete(ctx.channel!.id)
            await ctx.reply('*hangs up*')
            return
        }
        await new TalkingBen(ctx).call()
    }
} satisfies SlashCommand

const activeCalls = new Set<string>()

class TalkingBen {
    private responses = ['no', 'yes', 'ho ho ho ho', 'eugh']
    constructor(private ctx: CommandContext) {}

    async call() {
        if (this.ctx.getInstallationType() !== BotInstallationType.GuildInstall || this.ctx.getInstallationType() !== BotInstallationType.UserInstallDM) {
            this.ctx.reply(`The command is not supported: You should be either in my DM's, or I should be in the server (installation type detected: ${this.ctx.getInstallationType()})`)
            return
        }
        if (!this.ctx.channel) throw new Error('No channel')
        if (activeCalls.has(this.ctx.channel.id)) {
            await this.ctx.reply({ content: 'Ben is already on a call in this channel.', flags: MessageFlags.Ephemeral })
            return
        }

        activeCalls.add(this.ctx.channel.id)

        try {
            await this.ring()
            await this.pickUp()
            await this.prompt()
            await this.handleAnswerLoop()
        } catch (error) {
            activeCalls.delete(this.ctx.channel.id)
            if (error instanceof Error && error.message.includes('time')) {
                await this.ctx.followUp('*hangs up due to inactivity*')
            } else {
                // Log other errors if necessary
                console.error('Error in TalkingBen call:', error)
            }
        }
    }

    async ring() {
        await this.ctx.reply('☎️ *ringing*')
        await sleep(1000)
    }

    async pickUp() {
        await this.ctx.followUp('📞 *Picks up the phone.*')
        await sleep(1000)
    }

    async prompt() {
        await this.ctx.followUp('📞 ben?')
    }

    async handleAnswerLoop() {
        while (activeCalls.has(this.ctx.channel!.id)) {
            const message = await this.waitForMessage()
            if (!message) break

            if (chance(15)) {
                await this.ctx.followUp('*hangs up*')
                activeCalls.delete(this.ctx.channel!.id)
                break
            }

            const response = getRandomElement(this.responses)
            await sleep(1500)
            await message.reply(response)
        }
    }

    async waitForMessage(): Promise<Message> {
        if (!this.ctx.channel || this.ctx.channel.type === ChannelType.GroupDM) throw new Error('Channel not available for waiting for messages.')
        const collected = await this.ctx.channel.awaitMessages({
            filter: (m: Message) => m.author.id !== this.ctx.client.user.id,
            max: 1,
            time: 60000, // 60 seconds
            errors: ['time']
        })
        const message = collected.first()
        if (!message) throw new Error('No message collected.')
        return message
    }
}
