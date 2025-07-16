import type { Message } from 'discord.js'
import type { MessageTriggerEntry as MessageTriggers } from '../types'
import { chance, getRandomElement } from '../util/functions'
import { EMBI_ID, PING_EMBI } from '../util/constants'
import { sleep } from 'bun'
import type { GuildMember } from 'discord.js'

export class MessageTrigger {
    triggers: MessageTriggers[] = [
        {
            pattern: [/comic/gmi, /peg/gmi, /mick/gmi, msg => msg.author.id === '244975212448317440'],
            async action(message) {
                if (chance(10)) await message.reply('<:peg:1341742361004212285><:ging:1341742389257310279>')
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
                if (message.mentions.users.has(EMBI_ID) || message.author.id === EMBI_ID) return
                if (message.guildId !== '958518067690868796') return
                if (chance(50)) await message.reply(getRandomElement([
                    'https://cdn.discordapp.com/attachments/982138135653793804/1374422035769462824/Vesktop_iH8AUuU6rH.png?ex=682dfdc4&is=682cac44&hm=1f37d03b5501415f6c38ff1e894e73f9d8ceb37430840908609b15a1d8ad3285&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1374422059534516294/Vesktop_0rpn0aJGEh.png?ex=682dfdca&is=682cac4a&hm=8b34b654b7ca3b9d00767090d471a93af56e5784d0991e6cb6d011c6bf8eb5d8&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1374422832867577939/Vesktop_cBoXqxNkmV.png?ex=682dfe82&is=682cad02&hm=dcc627b1f25f17f0c4535579fae57570c35676679ffe950c53aaab30cfe057a0&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1374423151458390017/Vesktop_9xv5wElu0F.png?ex=682dfece&is=682cad4e&hm=43dcc535f453d65c7b62a04b4af4a1e9c1ed3dee6a25d4dac514d33602f7f8f7&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1374423595425595512/Vesktop_19sIxDqsR4.png?ex=682dff38&is=682cadb8&hm=8e13d8a2eb71bec814be7478a591aa361effd0de755ab1d1df04c20a42a7b6f7&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1374423912745799721/Vesktop_jN1dJsstMt.png?ex=682dff84&is=682cae04&hm=ec301535d6dcf685a153fbe7d4106ca639071286747c7f8b04460de2894c4139&',
                    ''
                ]))
                const emberglaze = await message.client.users.fetch(EMBI_ID)
                await emberglaze.send(`${PING_EMBI} https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`)
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
                const ashleighId = '231808039282409472'
                if (message.channelId === '1372567739931037890') return
                if (message.guildId !== '958518067690868796') return
                if (message.mentions.users.has(ashleighId) || message.author.id === ashleighId) return
                if (chance(50)) await message.reply(getRandomElement([
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1331344509036003338/file.jpg?ex=67e25af2&is=67e10972&hm=847306a43bf42323c2ffa3e1b641d1a4bd1c3a737d89a526e84df7e034694dc0&',
                    'https://media.discordapp.net/attachments/1351770874625130577/1351770895559164004/image.png?ex=67e2d680&is=67e18500&hm=235591676beae2c24528840dc66a2b78ee4fbef5fb16747edb0783b8ef561cb3&format=webp&quality=lossless&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386323970369912832/image.png?ex=68594a4f&is=6857f8cf&hm=b13f4b8ed47332399b5f3041c1ef83554a4e318fb44ee779d2741b376ae55a4c&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386324233218691072/image.png?ex=68594a8d&is=6857f90d&hm=c8c34691b8f7ee07058608123d54292c385839b4506d4aa7160aeb090e6b3933&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386324412445233202/image.png?ex=68594ab8&is=6857f938&hm=7fa1337b8eab17b98b7f4b44efa09470a90de798c211ec58672d30e30c8041dc&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386324619623141396/image.png?ex=68594ae9&is=6857f969&hm=dae4e84245c65bbee3cf34ebf09d494f4084b0e65fdd1cc25a3fc8c633367710&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386324839421448253/image.png?ex=68594b1e&is=6857f99e&hm=892bdc7165f54ca17c8d2d0bd450f2d39f9bdeac07c6084b6079fa77ebaa894f&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1355768084924989540/image.png?ex=67ea20ec&is=67e8cf6c&hm=9342543ff6bdec05d9e8e5346f08a9cbe9bfe9772632e0d8989ec1b4c41658da&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1356649100799381504/image.png?ex=67ed556e&is=67ec03ee&hm=605345c9967419e100425cbff6cb7038ee695917873bd1078f0eb28224b75838&',
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1362140010224029696/Screenshot_20250331_171833_Discord.png?ex=68014f3d&is=67fffdbd&hm=bf1471b101589b11f81978e3fc15226656ccb347e5b4da4b04a45f4e4deaba05&',
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1362140010559705260/image.png?ex=68014f3d&is=67fffdbd&hm=ff8f1cd3bf09fd0d8dca408a43c81f89ebcfa2fbb33aaeae1a07eddc0d74455c&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1362142160606199988/image.png?ex=6801513e&is=67ffffbe&hm=3920645809825cd0a04615a6d78beae4e44dcbdd89532af8b95cc0390d4c85fa&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386321925340532808/image.png?ex=68594867&is=6857f6e7&hm=d39bae8efb9a310efefe0ca677ebc78eadbeafc190de7446b4152203ec117d31&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386321932848468109/image.png?ex=68594869&is=6857f6e9&hm=ce0ade2cbd71ddfde03e522cfb22b387fa1d0820c19a06331bf90c5be5b4155b&'
                ]))
                const ashleigh = await message.client.users.fetch(ashleighId)
                await ashleigh.send(`<@${ashleighId}> https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`)
            }
        },
        {
            pattern: [/fish/gmi, /\byou know what that means\b/gmi, /effic/gmi /* pronounciation pun: 'effish' (efficient => ef_fish_ient) */],
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
            pattern: [/\bhungry\b/gmi],
            async action(message) {
                await message.react('🐴')
                await message.reply(getRandomElement([
                    'https://tenor.com/view/horse-you-have-alerted-the-horse-alert-alert-horse-horse-alert-gif-10675569724654458517',
                    'https://tenor.com/view/order-of-iris-how-hungry-horse-honse-gif-14835892721220569918'
                ]))
            }
        },
        {
            pattern: [/horse/gmi],
            async action(message) {
                await message.react('🐴')
            },
        },
        {
            pattern: [/femboy/gmi],
            async action(message) {
                if (chance(1)) await message.reply('https://tenor.com/view/%D1%84%D1%81%D0%B1-gif-21407990')
            }
        },
        {
            pattern: [/chicken jockey/gmi],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://tenor.com/view/minecraft-minecraft-movie-a-minecraft-movie-steve-jack-black-gif-4079785775268000209',
                    'https://tenor.com/view/minecraft-movie-theater-popcorn-explosion-crazy-gif-7283614019765734813',
                    'https://tenor.com/view/chicken-jockey-minecraft-movie-minecraft-memes-minecraft-meme-chicken-jockey-flag-gif-6036972012917778487'
                ]))
            }
        },
        {
            pattern: [/(?:i'm|im|i am)\s+(.+)/gmi],
            async action(message) {
                if (!message.member?.moderatable) return
                if (
                    message.member.id === '1065465855191814284' // screw them in particular
                    || !chance(1)
                ) return

                const match = message.content.match(/(?:i'm|im|i am)\s+(.+)/gmi)
                if (!match) return

                let name = match[0].replace(/(?:i'm|im|i am)\s+/gmi, '').trim()
                name = name.split(/[.,]/)[0].trim()
                if (name.length > 32) {
                    name = name.substring(0, 32)
                }
                if (!name) return

                const member = message.member as GuildMember
                const originalNickname = member.nickname

                await message.member.setNickname(name)
                await message.reply(`hi \`${name}\`, im crimson 1`)
                await sleep(60 * 1000)
                await message.member.setNickname(originalNickname)
            }
        }
    ]
    async processMessage(message: Message) {
        const matchingTriggers: MessageTriggers[] = []
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
