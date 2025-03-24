import type { Message } from 'discord.js'
import type { ScreamOnSightTrigger } from '../types/types'

export class ScreamOnSight {
    triggers: ScreamOnSightTrigger[] = [
        {
            regex: [/comic/gm, /peg/gm],
            async action(message) {
                await message.reply('<:peg:1341742361004212285><:ging:1341742389257310279>')
            }
        }
    ]
    async processMessage(message: Message) {
        for (const { regex, action } of this.triggers) if (regex.some(r => r.test(message.content))) await action(message)
    }
}
