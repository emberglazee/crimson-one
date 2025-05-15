import type { Message } from 'discord.js'
import type { ScreamOnSightTrigger } from '../types/types'
import { chance, getRandomElement } from '../util/functions'
import { EMBERGLAZE_ID, PING_EMBERGLAZE } from '../util/constants'

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
                await message.reply(getRandomElement([
                    'https://cdn.discordapp.com/attachments/1125900471924699178/1303877939049402409/cachedVideo.mov?ex=67e1f7f5&is=67e0a675&hm=108fde1dc8376d2db90d81300944d2e232d9fdecb3ea0bbc139567bb2473233a&', // Q2
                    'https://media.discordapp.net/attachments/1267488539503886386/1346032804449882172/lv_0_20250302125127.mp4?ex=67e1bcfc&is=67e06b7c&hm=ba256a66f0c02d41be35bef627b7b84d1629df3e0aee8158c3b83615eadb279e&' // Q4
                ]))
            }
        },
        {
            pattern: [/invisible/gmi, /big boss/gmi, /solid snake/gmi],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://tenor.com/view/mgs-metal-gear-solid-phantom-pain-venom-snake-gif-5631901306578330322',
                    'https://tenor.com/view/venom-snake-walk-mgsv-mgs-mgs5-gif-27690753',
                    'https://tenor.com/view/metal-gear-venom-snake-gif-26285931',
                    'https://tenor.com/view/metal-gear-solid-snake-big-boss-gif-12248663',
                    'https://tenor.com/view/metal-gear-solid-phantom-pain-metal-gear-solid-v-snake-big-boss-gif-6526414909388443363',
                    'https://tenor.com/view/mgs-mgsv-metal-gear-solid-big-boss-gif-27478240'
                ]))
            }
        },
        {
            pattern: [/absolute cinema/gmi],
            async action(message) {
                await message.reply(getRandomElement([
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
                    'https://tenor.com/view/absolute-cinema-absolute-freaky-gif-479618626165428928',
                    'https://tenor.com/view/absolute-cinema-cinema-neqsil-neqsil-gif-tokidoki-bosotto-russia-go-de-dereru-tonari-no-alya-san-gif-7194922688176180121',
                    'https://tenor.com/view/absolute-cinema-zerep-neovox-gif-6586104594546620988',
                    'https://tenor.com/view/absolute-cinema-miside-mita-peak-smash-gif-6314619750132899497',
                    'https://tenor.com/view/absolute-cinema-ryo-yamada-ry-ryo-meme-gif-9636831842365625847',
                    'https://tenor.com/view/absolute-cinema-absolute-cinema-boykisser-gif-8548693639845499838',
                    'https://tenor.com/view/mattis-ai-generated-absolute-cinema-black-and-white-greyscale-gif-15545318427947589245'
                ]))
            }
        },
        {
            pattern: [/spade incoming/gmi],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1344353319849558140/39e67e09-c811-479a-8011-9fb07b917e0e.gif?ex=67e23858&is=67e0e6d8&hm=79d98a161943f6e42ac43a9cf12b72000ea72102f43c8f936a5930ce735ab5ba&',
                    'https://cdn.discordapp.com/attachments/1225579254448652420/1280117275063484458/makesweet-9h1bj4.gif?ex=67e1e15d&is=67e08fdd&hm=bf1121e8169df5acf545947cf577ca81d2e486db04bec7d2d77686f27909f28b&',
                    'https://tenor.com/view/shots-fired-smoke-shoot-gif-15830209',
                    'https://tenor.com/view/dog-swing-gif-23878746',
                    'https://tenor.com/view/grand-theft-auto-gta-gta5-gta-v-davey-gif-25947802',
                    'https://tenor.com/view/project-wingman-crimson-1-cordium-consequence-of-power-gif-18137013603651714218',
                    'https://tenor.com/view/%D0%BF%D1%80%D0%B0%D1%86%D1%8E%D1%94-%D0%BF%D0%BF%D0%BE-%D0%BF%D0%BF%D0%BE-%D0%BF%D0%B2%D0%BE-%D0%BF%D0%B5%D1%82%D1%80%D1%96%D0%BE%D1%82-%D0%BF%D0%B0%D1%82%D1%80%D1%96%D0%BE%D1%82-gif-12934051785885241735'
                ]))
            }
        },
        {
            pattern: [/embi/gmi, /\bember/gmi],
            async action(message) {
                if (message.channelId === '1372567739931037890') return
                const emberglaze = await message.client.users.fetch(EMBERGLAZE_ID)
                await emberglaze.send(`${PING_EMBERGLAZE} https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}\n-# Guild ${message.guild?.name || 'null'} (${message.guild?.id || 'null'})`)
            }
        },
        {
            pattern: [/shelby/gmi],
            async action(message) {
                await message.reply('https://media.discordapp.net/attachments/311334325402599425/1327830607094485073/youtube__uj7Ztu3Alg_576x742_h264.mp4?ex=67e2189e&is=67e0c71e&hm=492a1e8d4e21cdc2495cc0c83111982cfd9ef07f3b0bf4a5240c622259830473&')
            }
        },
        {
            pattern: [/\bash\b/gmi, /ashleigh/gmi],
            async action(message) {
                if (chance(50)) await message.reply(getRandomElement([
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1331344509036003338/file.jpg?ex=67e25af2&is=67e10972&hm=847306a43bf42323c2ffa3e1b641d1a4bd1c3a737d89a526e84df7e034694dc0&',
                    'https://media.discordapp.net/attachments/1351770874625130577/1351770895559164004/image.png?ex=67e2d680&is=67e18500&hm=235591676beae2c24528840dc66a2b78ee4fbef5fb16747edb0783b8ef561cb3&format=webp&quality=lossless&',
                    'https://r2.e-z.host/553257c7-6ffa-45c8-9d1c-531ea7d264db/segsymg2.png',
                    'https://r2.e-z.host/553257c7-6ffa-45c8-9d1c-531ea7d264db/ddwyn9pr.png',
                    'https://r2.e-z.host/553257c7-6ffa-45c8-9d1c-531ea7d264db/97ggmkis.png',
                    'https://r2.e-z.host/553257c7-6ffa-45c8-9d1c-531ea7d264db/xp4356ma.png',
                    'https://r2.e-z.host/553257c7-6ffa-45c8-9d1c-531ea7d264db/1g2x2058.png',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1355768084924989540/image.png?ex=67ea20ec&is=67e8cf6c&hm=9342543ff6bdec05d9e8e5346f08a9cbe9bfe9772632e0d8989ec1b4c41658da&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1356649100799381504/image.png?ex=67ed556e&is=67ec03ee&hm=605345c9967419e100425cbff6cb7038ee695917873bd1078f0eb28224b75838&',
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1362140010224029696/Screenshot_20250331_171833_Discord.png?ex=68014f3d&is=67fffdbd&hm=bf1471b101589b11f81978e3fc15226656ccb347e5b4da4b04a45f4e4deaba05&',
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1362140010559705260/image.png?ex=68014f3d&is=67fffdbd&hm=ff8f1cd3bf09fd0d8dca408a43c81f89ebcfa2fbb33aaeae1a07eddc0d74455c&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1362142160606199988/image.png?ex=6801513e&is=67ffffbe&hm=3920645809825cd0a04615a6d78beae4e44dcbdd89532af8b95cc0390d4c85fa&'
                ]))
            }
        },
        {
            pattern: [/fish/gmi, /\byou know what that means\b/gmi, /effic/gmi /* intended pun in pronounciation: 'effish' (efficient => ef_fish_ient) */],
            async action(message) {
                await message.react('🐟')
                if (chance(10)) await message.reply(getRandomElement([
                    'https://tenor.com/view/fish-gas-station-you-know-what-that-means-gif-1113666392679473186',
                    'https://tenor.com/view/fish-meme-you-know-what-that-means-gif-12503956388971591256',
                    'https://cdn.discordapp.com/attachments/1331556083776487444/1350097724204122212/caption.gif?ex=67e2aefd&is=67e15d7d&hm=aad1f8a3b156e93e539c279544f985eab49277c6100c4104ccaf3a7151cb325d&',
                    'https://tenor.com/view/funny-fish-launch-gif-14878073'
                ]))
            }
        },
        {
            pattern: [/\bi miss my wife\b/gmi],
            async action(message) {
                await message.reply('https://tenor.com/view/dance-gecko-gif-21029304')
            }
        },
        {
            pattern: [/\bhungry\b/],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://tenor.com/view/horse-you-have-alerted-the-horse-alert-alert-horse-horse-alert-gif-10675569724654458517',
                    'https://tenor.com/view/order-of-iris-how-hungry-horse-honse-gif-14835892721220569918'
                ]))
            }
        },
        {
            pattern: [/femboy/],
            async action(message) {
                if (chance(1)) await message.reply('https://tenor.com/view/%D1%84%D1%81%D0%B1-gif-21407990')
            },
        }
    ]
    async processMessage(message: Message) {
        const matchingTriggers: ScreamOnSightTrigger[] = []
        for (const { pattern, action } of this.triggers) {
            if (pattern.some(
                r => r instanceof RegExp
                    ? r.test(message.content) : typeof r === 'function'
                    ? r(message) : message.content.includes(r)
            )) {
                matchingTriggers.push({ pattern, action })
            }
        }

        // If there are matching triggers, pick a random one and execute the action
        if (matchingTriggers.length > 0) {
            const randomTrigger = getRandomElement(matchingTriggers)
            await randomTrigger.action(message)
        }
    }
}
