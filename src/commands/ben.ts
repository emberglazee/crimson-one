import { Message, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../types'
import type { CommandContext } from '../modules/CommandManager/CommandContext'
import { sleep } from 'bun'
import { chance, getRandomElement } from '../util/functions'

export default {
    data: new SlashCommandBuilder()
        .setName('ben')
        .setDescription('Talking Ben on Discord'),
    async execute(ctx) {
        await new TalkingBen(ctx).call()
    }
} satisfies SlashCommand

class TalkingBen {
    calls: ChannelId[] = []
    responses = ['no', 'yes', 'ho ho ho ho', 'eugh']
    constructor(private ctx: CommandContext) {}
    async call() {
        if (!this.ctx.channel) throw new Error('No channel')
        if (this.calls.includes(this.ctx.channel.id)) throw new Error('Already calling')
        this.calls.push(this.ctx.channel.id)
        await this.ring()
        await this.pickUp()
        await this.prompt()
        await this.handleAnswer()
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
    async handleAnswer() {
        const message = await this.waitForMessage()
        if (chance(15)) {
            await this.ctx.followUp('*hangs up*')
            this.calls = this.calls.filter(channelId => channelId !== this.ctx.channel!.id)
            return
        }
        const response = getRandomElement(this.responses)
        await sleep(1500)
        await message.reply(response)
        await this.handleAnswer()
    }
    waitForMessage(): Promise<Message> {
        return new Promise(resolve => {
            this.ctx.client.on('messageCreate', async message => {
                if (message.channel.id !== this.ctx.channel!.id || message.author == this.ctx.client.user) return
                resolve(message)
            })
        })
    }
}

type ChannelId = string & {}
