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
                    'https://cdn.discordapp.com/attachments/1125900471924699178/1303877939049402409/cachedVideo.mov?ex=67e1f7f5&is=67e0a675&hm=108fde1dc8376d2db90d81300944d2e232d9fdecb3ea0bbc139567bb2473233a&', // Q2
                    'https://media.discordapp.net/attachments/1267488539503886386/1346032804449882172/lv_0_20250302125127.mp4?ex=67e1bcfc&is=67e06b7c&hm=ba256a66f0c02d41be35bef627b7b84d1629df3e0aee8158c3b83615eadb279e&' // Q4
                ]
                const variant = variants[randRange(1, 2)]
                await message.reply(variant)
            },
        },
        {
            pattern: [/invisible/gmi],
            async action(message) {
                const variants = [
                    'https://tenor.com/view/mgs-metal-gear-solid-phantom-pain-venom-snake-gif-5631901306578330322',
                    'https://tenor.com/view/venom-snake-walk-mgsv-mgs-mgs5-gif-27690753',
                    'https://tenor.com/view/metal-gear-venom-snake-gif-26285931'
                ]
                const variant = variants[randRange(1, 3)]
                await message.reply(variant)
            },
        }
    ]
    async processMessage(message: Message) {
        for (const { pattern, action } of this.triggers) if (pattern.some(r => r instanceof RegExp ? r.test(message.content) : message.content.includes(r))) await action(message)
    }
}
