import type { Message } from 'discord.js'
import type { ScreamOnSightTrigger } from '../types/types'

export class ScreamOnSight {
    triggers: ScreamOnSightTrigger[] = [
        {
            regex: /comic/gm,
            async action(message) {
                await message.reply('<:peg:1341742361004212285><:ging:1341742389257310279>')
            }
        }
    ]
    async processMessage(message: Message) {
        for (const trigger of this.triggers) if (trigger.regex.test(message.content)) await trigger.action(message)
    }
}
