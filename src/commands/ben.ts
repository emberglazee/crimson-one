import { ChannelType, Message, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../types'
import type { CommandContext } from '../modules'
import { chance, getRandomElement, sleep } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('ben')
        .setDescription('Talking Ben on Discord'),
    async execute(ctx) {
        await new TalkingBen(ctx).call()
    }
} satisfies SlashCommand

const activeCalls = new Set<string>()

class TalkingBen {
    private responses = ['no', 'yes', 'ho ho ho ho', 'eugh']
    constructor(private ctx: CommandContext) {}

    async call() {
        if (!this.ctx.channel) throw new Error('No channel')
        if (activeCalls.has(this.ctx.channel.id)) {
            await this.ctx.reply({ content: 'Ben is already on a call in this channel.', ephemeral: true })
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
        await this.ctx.followUp('📞 *picked up*')
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
        if (!this.ctx.channel || this.ctx.channel.type === ChannelType.GroupDM) throw new Error('Channel not available for waiting for message.')
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
