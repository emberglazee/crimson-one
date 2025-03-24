import type { Message } from 'discord.js'
import type { ScreamOnSightTrigger } from '../types/types'

export class ScreamOnSight {
    triggers: ScreamOnSightTrigger[] = [
        {
            pattern: ['comic', 'peg'],
            async action(message) {
                await message.reply('<:peg:1341742361004212285><:ging:1341742389257310279>')
            }
        }
    ]
    async processMessage(message: Message) {
        for (const { pattern, action } of this.triggers) if (pattern.some(r => r instanceof RegExp ? r.test(message.content) : message.content.includes(r))) await action(message)
    }
}
