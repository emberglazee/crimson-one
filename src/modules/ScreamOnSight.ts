import type { Message } from 'discord.js'
import type { ScreamOnSightTrigger } from '../types/types'
import { randArr } from '../util/functions'

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
                const variant = randArr(variants)
                await message.reply(variant)
            },
        },
        {
            pattern: [/invisible/gmi],
            async action(message) {
                const variants = [
                    'https://tenor.com/view/mgs-metal-gear-solid-phantom-pain-venom-snake-gif-5631901306578330322',
                    'https://tenor.com/view/venom-snake-walk-mgsv-mgs-mgs5-gif-27690753',
                    'https://tenor.com/view/metal-gear-venom-snake-gif-26285931',
                    'https://tenor.com/view/metal-gear-solid-snake-big-boss-gif-12248663'
                ]
                const variant = randArr(variants)
                await message.reply(variant)
            },
        },
        {
            pattern: [/absolute cinema/gmi],
            async action(message) {
                const variants = [
                    'https://tenor.com/view/absolute-cinema-cinema-cine-absolute-cine-gif-5324030207930286506',
                    'https://tenor.com/view/johnqt-cinema-johnqt-absolute-cinema-gif-8595958281962294369',
                    'https://tenor.com/view/me-atrapaste-es-cine-its-cinema-cinema-esto-es-cine-gif-17729711691959966457',
                    'https://tenor.com/view/absolutecinemafurina-gif-2893814276432636385',
                    'https://tenor.com/view/absolute-cinema-martin-scorsese-cinema-this-is-cinema-gif-11588665845979953173',
                    'https://tenor.com/view/mickey-mickey-mouse-absolute-cinema-meme-disney-gif-9794395175278437605',
                    'https://tenor.com/view/benjammins-absolute-cinema-cinema-absolute-cin-absolutely-cinema-gif-7850400440861313269',
                    'https://tenor.com/view/absolute-cinema-gif-16944752780895267751',
                    'https://tenor.com/view/vito-scaletta-absolute-cinema-this-is-cinema-mafia-2-gif-14781182317356154420',
                    'https://tenor.com/view/absolute-cinema-goku-meme-gif-4390409262190208448',
                    'https://tenor.com/view/sonic-the-hedgehog-sonic-3-sonic-meme-sonic-cinema-sonic-movie-3-gif-3050060157188629982',
                    'https://tenor.com/view/johan-liebert-absolute-cinema-johan-liebert-absolute-cinema-gif-15560812256995316471',
                    'https://tenor.com/view/majin-buu-absolute-cinema-dragon-ball-z-dragon-ball-gif-2677998243209392972',
                    'https://tenor.com/view/jinx-lol-arcane-absolute-cinema-absolutecinema-gif-2823717891940156292',
                    'https://tenor.com/view/scary-scream-aaaa-martin-scorsese-scorsese-gif-1034167448643503493',
                    'https://tenor.com/view/absolute-cinema-absolute-freaky-gif-479618626165428928'
                ]
                const variant = randArr(variants)
                await message.reply(variant)
            }
        },
        {
            pattern: [/spade incoming/gmi],
            async action(message) {
                const variants = [
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1344353319849558140/39e67e09-c811-479a-8011-9fb07b917e0e.gif?ex=67e23858&is=67e0e6d8&hm=79d98a161943f6e42ac43a9cf12b72000ea72102f43c8f936a5930ce735ab5ba&',
                    'https://cdn.discordapp.com/attachments/1225579254448652420/1280117275063484458/makesweet-9h1bj4.gif?ex=67e1e15d&is=67e08fdd&hm=bf1121e8169df5acf545947cf577ca81d2e486db04bec7d2d77686f27909f28b&',
                    'https://tenor.com/view/shots-fired-smoke-shoot-gif-15830209',
                    'https://tenor.com/view/dog-swing-gif-23878746',
                    'https://tenor.com/view/grand-theft-auto-gta-gta5-gta-v-davey-gif-25947802',
                    'https://tenor.com/view/project-wingman-crimson-1-cordium-consequence-of-power-gif-18137013603651714218'
                ]
                const variant = randArr(variants)
                await message.reply(variant)
            },
        }
    ]
    async processMessage(message: Message) {
        for (const { pattern, action } of this.triggers) if (pattern.some(r => r instanceof RegExp ? r.test(message.content) : message.content.includes(r))) await action(message)
    }
}
