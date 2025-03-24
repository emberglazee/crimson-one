import type { Message } from 'discord.js'
import type { ScreamOnSightTrigger } from '../types/types'
import { randRange } from '../util/functions'

export class ScreamOnSight {
    triggers: ScreamOnSightTrigger[] = [
        {
            pattern: [/comic/gmi, /peg/gmi],
            async action(message) {
                await message.reply('<:peg:1341742361004212285><:ging:1341742389257310279>')
            }
        },
        {
            pattern: [/ronald mcdonald/gmi],
            async action(message) {
                const variants = [
                    'https://cdn.discordapp.com/attachments/311334325402599425/1307805230246793287/HjDvLkbP0eP6oLok.mov?ex=67e1c108&is=67e06f88&hm=69438eeed54ba9ee768fa615607b7f256260d0055b970f2824eff9795106e01a&',
                    'https://cdn.discordapp.com/attachments/1125900471924699178/1303877939049402409/cachedVideo.mov?ex=67e1f7f5&is=67e0a675&hm=108fde1dc8376d2db90d81300944d2e232d9fdecb3ea0bbc139567bb2473233a&',
                    'https://cdn.discordapp.com/attachments/1335990015989125213/1337635592976076831/areyoureadyforzenewworldorder.mp4?ex=67e22bb9&is=67e0da39&hm=738de76475fd36f40dcecd80db555b2507bb460828a422d038fdbdc60a57dbb8&',
                    'https://media.discordapp.net/attachments/1267488539503886386/1346032804449882172/lv_0_20250302125127.mp4?ex=67e1bcfc&is=67e06b7c&hm=ba256a66f0c02d41be35bef627b7b84d1629df3e0aee8158c3b83615eadb279e&'
                ]
                const variant = variants[randRange(1, 4)]
                await message.reply(variant)
            },
        }
    ]
    async processMessage(message: Message) {
        for (const { pattern, action } of this.triggers) if (pattern.some(r => r instanceof RegExp ? r.test(message.content) : message.content.includes(r))) await action(message)
    }
}
