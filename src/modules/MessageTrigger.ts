import { singleton } from 'tsyringe'
import type { Message } from 'discord.js'
import type { MessageTriggerEntry as MessageTriggers } from '../types'
import { chance, getRandomElement } from '../util/functions'
import { EMBI_ID, PING_EMBI, SOLITARY_CONFINEMENT_GUILD_ID } from '../util/constants'
import { sleep } from 'bun'
import type { GuildMember } from 'discord.js'

@singleton()
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
            pattern: [/invisible/gmi, /big boss/gmi, /solid snake/gmi, /phantom pain/gmi],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://tenor.com/view/mgs-metal-gear-solid-phantom-pain-venom-snake-gif-5631901306578330322',
                    'https://tenor.com/view/venom-snake-walk-mgsv-mgs-mgs5-gif-27690753',
                    'https://tenor.com/view/metal-gear-venom-snake-gif-26285931',
                    'https://tenor.com/view/metal-gear-solid-snake-big-boss-gif-12248663',
                    'https://tenor.com/view/metal-gear-solid-phantom-pain-metal-gear-solid-v-snake-big-boss-gif-6526414909388443363',
                    'https://tenor.com/view/mgs-mgsv-metal-gear-solid-big-boss-gif-27478240',
                    'https://tenor.com/view/mgsv-mgs5-mgs-metal-gear-solid-metal-gear-solid-5-gif-7889838534933531334',
                    'https://tenor.com/view/mgsv-metal-gear-solid-v-the-phantom-pain-venom-snake-big-boss-gif-25120242'
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
                    'https://tenor.com/view/mattis-ai-generated-absolute-cinema-black-and-white-greyscale-gif-15545318427947589245',
                    'https://tenor.com/view/absolute-cinema-raccoon-absolute-cinema-gif-17862327649353748812',
                    'https://tenor.com/view/walter-walter-white-walter-white-absolute-cinema-white-walter-absolute-gif-10929974052418095046'
                ]))
            }
        },
        {
            pattern: [/spadeeeeeeeeeeeeeeeeeeee/gmi],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1344353319849558140/39e67e09-c811-479a-8011-9fb07b917e0e.gif?ex=67e23858&is=67e0e6d8&hm=79d98a161943f6e42ac43a9cf12b72000ea72102f43c8f936a5930ce735ab5ba&',
                    'https://cdn.discordapp.com/attachments/1225579254448652420/1280117275063484458/makesweet-9h1bj4.gif?ex=67e1e15d&is=67e08fdd&hm=bf1121e8169df5acf545947cf577ca81d2e486db04bec7d2d77686f27909f28b&',
                    'https://tenor.com/view/shots-fired-smoke-shoot-gif-15830209',
                    'https://tenor.com/view/dog-swing-gif-23878746',
                    'https://tenor.com/view/grand-theft-auto-gta-gta5-gta-v-davey-gif-25947802',
                    'https://tenor.com/view/project-wingman-crimson-1-cordium-consequence-of-power-gif-18137013603651714218',
                    'https://tenor.com/view/%D0%BF%D1%80%D0%B0%D1%86%D1%8E%D1%94-%D0%BF%D0%BF%D0%BE-%D0%BF%D0%BF%D0%BE-%D0%BF%D0%B2%D0%BE-%D0%BF%D0%B5%D1%82%D1%80%D1%96%D0%BE%D1%82-%D0%BF%D0%B0%D1%82%D1%80%D1%96%D0%BE%D1%82-gif-12934051785885241735',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441173396393164820/image.png?ex=6920d4d1&is=691f8351&hm=057124e122b56586166862ec70a8a99f1bef86cb6f3fbd8f15bffcd92348ceab&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441173688014602300/image.png?ex=6920d516&is=691f8396&hm=c863bcc1b60662be93d180302cbb9e146b45b06cecce23b19dd574f0f1baec1d&'
                ]))
            }
        },
        {
            pattern: [/embi/gmi, /\bember/gmi],
            async action(message) {
                if (message.channelId === '1372567739931037890') return
                if (message.mentions.users.has(EMBI_ID) || message.author.id === EMBI_ID) return
                if (message.guildId !== SOLITARY_CONFINEMENT_GUILD_ID) return
                if (chance(50)) await message.reply(getRandomElement([
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441168198857916510/image.png?ex=6920cffa&is=691f7e7a&hm=d394326b0355911a1264fd7d5c6947e7513e5d3447e9887720f97c5238a7f924&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441168467326799985/image.png?ex=6920d03a&is=691f7eba&hm=2eaadc52d2454ccdab7d59a2eaa4734db2075c863cc6164d43de94139db87033&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441169290748498000/image.png?ex=6920d0fe&is=691f7f7e&hm=8f45939afdc32412631bb10dae7f14689d26cc8babb2f2685feadc18c38d1fc8&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441169616054517841/image.png?ex=6920d14c&is=691f7fcc&hm=b2617c203174cb990e24d5ff91fbdd450356f1260b1d1cf5f15e0aa6684c28bd&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441172201352069180/image.png?ex=6920d3b4&is=691f8234&hm=b0621af698a37aea70c8ab8240a900f9ad6f79ef170e45571e0c5287d8092905&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441170152077918239/image.png?ex=6920d1cb&is=691f804b&hm=8d3269461444770914b983cc085cd500d3da698ec9ec4a94fe0a8eb2230b8692&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441170495990005850/image.png?ex=6920d21d&is=691f809d&hm=ae0b585f13459a16daaed308b8d162b52248392fbea041a94e45609e9273ae89&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441170760348602599/image.png?ex=6920d25c&is=691f80dc&hm=99f366251d14a6171d1bea42722acb73a12c749060d49074ef1511edc6549b46&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441171222443331654/image.png?ex=6920d2cb&is=691f814b&hm=1b2c68cfc0b275c47acb0b6400dcb590b0a18881501f8e4781efbd9e9f8b4565&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441171211878142004/image.png?ex=6920d2c8&is=691f8148&hm=d3ff3f666b49eb15946c36c03778b5fc9ddb036cc977c8eb989a6d3d3c547375&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441171493655543870/image.png?ex=6920d30b&is=691f818b&hm=56d62ebdabbe1838dd52fe38e63cb3832d5165d75e21e724fad62ae776952eea&'
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
                if (message.guildId !== SOLITARY_CONFINEMENT_GUILD_ID) return
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
                    'https://cdn.discordapp.com/attachments/982138135653793804/1386321932848468109/image.png?ex=68594869&is=6857f6e9&hm=ce0ade2cbd71ddfde03e522cfb22b387fa1d0820c19a06331bf90c5be5b4155b&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1396164071925219519/image.png?ex=687d169e&is=687bc51e&hm=040a51bbd38f6edbcd3aa445a069acde6732b4e519e308757a963406077c9de6&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441166718880841769/image.png?ex=6920ce99&is=691f7d19&hm=07c67bced3344ff9c8bc97a340421709aa6f9993b8741550949047d6da65377c&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441167368855228416/image.png?ex=6920cf34&is=691f7db4&hm=5058c0445c3958baeba9aa4479c5afb8271162fb9687c6583efa7ef3fe450270&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441172563496800367/image.png?ex=6920d40a&is=691f828a&hm=16a24732d180821a8ad43a8f600ae6d1aef8b690e74a579f1bd4d02e9cd387d7&',
                    'https://cdn.discordapp.com/attachments/982138135653793804/1441172998689394848/image.png?ex=6920d472&is=691f82f2&hm=06396a589eedb401204903ceb5b283a7e785df8ea45e4b68802c3ccc30adcd02&'
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
                    'https://tenor.com/view/funny-fish-launch-gif-14878073',
                    'https://tenor.com/view/salmon-cannon-new-military-weapon-salmon-gun-the-salmon-cannon-meme-gif-22114966',
                    'https://tenor.com/view/fich-drehender-fich-certified-fich-bunnyran56-bunnyran56-fich-gif-2494747943682487771'
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
                    'https://tenor.com/view/order-of-iris-how-hungry-horse-honse-gif-14835892721220569918',
                    'https://tenor.com/view/meme-horse-you-have-alerted-the-horse-pretty-derby-uma-musume-gif-15063465391514740847',
                    'https://tenor.com/view/how-hungry-horse-meme-how-hungry-meme-hungry-gif-3271609735629330991',
                    'https://tenor.com/view/you-have-alerted-the-horse-horse-gt-when-the-gif-13896701654039849313'
                ]))
            }
        },
        {
            pattern: [/horse/gmi],
            async action(message) {
                await message.react('🐴')
            }
        },
        {
            pattern: [/chicken jockey/gmi],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://tenor.com/view/minecraft-minecraft-movie-a-minecraft-movie-steve-jack-black-gif-4079785775268000209',
                    'https://tenor.com/view/minecraft-movie-theater-popcorn-explosion-crazy-gif-7283614019765734813',
                    'https://tenor.com/view/chicken-jockey-minecraft-movie-minecraft-memes-minecraft-meme-chicken-jockey-flag-gif-6036972012917778487',
                    'https://tenor.com/view/chicken-jockey-chicken-jockey-minecraft-minecraft-movie-gif-9774009371795721510'
                ]))
            }
        },
        {
            pattern: [/\b(i'm|im|i am)\b\s+(.+)/gmi],
            async action(message) {
                if (!message.member?.moderatable) return
                if (
                    message.member.id === '1065465855191814284' // screw them in particular
                    || !chance(1)
                ) return

                const match = message.content.match(/\b(i'm|im|i am)\b\s+(.+)/gmi)
                if (!match) return

                let name = match[0].replace(/\b(i'm|im|i am)\b\s+/gmi, '').trim()
                name = name.split(/[.,]/)[0].trim()
                if (name.length > 32) {
                    name = name.substring(0, 32)
                }
                if (!name) return

                const member = message.member as GuildMember
                const originalNickname = member.nickname

                await message.member.setNickname(name)
                await message.reply(`Hi \`${name}\`, I'm Crimson 1`)
                await sleep(60 * 1000)
                await message.member.setNickname(originalNickname)
            }
        },
        {
            pattern: [/twink/gmi],
            async action(message) {
                await message.reply('https://cdn.discordapp.com/attachments/1261829304271245463/1413087375105724507/r9rgr1evtph91.png?ex=68baa7ac&is=68b9562c&hm=f58001e1a1b88211e0f7449320883aa6114c406b809d23c84a3f2732c259fb8b&')
            }
        },
        {
            pattern: [/until then/gmi],
            async action(message) {
                await message.reply(getRandomElement([
                    'https://tenor.com/view/until-then-catherine-portillo-until-then-game-gif-2584337774223174448',
                    'https://tenor.com/view/until-then-until-then-cath-untilthen-cath-us-gif-777643791924215591',
                    'https://tenor.com/view/until-then-until-then-mark-until-then-mark-gif-16530595766137122906',
                    'https://tenor.com/view/until-then-untilthen-untilthengame-cathy-catherine-gif-14784323206851821179',
                    'https://cdn.discordapp.com/attachments/1267488539503886386/1441164083234738377/until-then-untilthen.gif?ex=6920cc24&is=691f7aa4&hm=5f8509e19fc17f66f68eafd11a1c0a2542a4270207f0938486b323e4ab30297b&',
                    'https://tenor.com/view/until-then-until-then-mark-mark-until-then-gif-15235730749064560255',
                    'https://tenor.com/view/until-then-until-then-cath-cathuntilthen-whoa-untilthen-gif-8724377859103188895'
                ]))
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
