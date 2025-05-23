import { ChannelType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types/types'
import { chance } from '../util/functions'
import { sleep } from 'bun'

export default {
    data: new SlashCommandBuilder()
        .setName('banish')
        .setDescription('Give a server member the `banished` role')
        .addUserOption(uo => uo
            .setName('member')
            .setDescription('Server member to banish')
            .setRequired(true)
        ).setContexts(InteractionContextType.Guild),
    async execute(context) {
        if (!context.guild) {
            await context.reply(`❌ why is \`interaction.guild\` nonexistant i thought i set the interaction context type to guilds only wtf ${context.user}`)
            return
        }

        if (!context.member) {
            await context.reply(`❌ for some reason i cant find you as a server member *sigh* ${context.pingMe}`)
            return
        }
        if (!context.member.permissions.has('ManageRoles')) {
            if (chance(1)) {
                // 1% chance to "no u" the user
                await context.reply(`🥀 you know what what about i banish you instead`)
                const target = await context.getUserOption('member', true)
                const targetMember = await context.guild.members.fetch(target)
                if (!targetMember) {
                    await context.followUp(`okay you got lucky you dont exist as a member for some reason (${context.pingMe} fix me)`)
                    return
                }
                const role = await context.guild.roles.fetch('1331170880591757434')
                if (!role) {
                    await context.followUp(`okay you got lucky the banished role doesnt exist`)
                    return
                }
                const roles = targetMember.roles.cache.filter(role => role.name !== '@everyone')
                if (roles.find(r => r.id === role.id)) {
                    await context.followUp(`ha look ur banished already`)
                    return
                }
                await targetMember.roles.add(role)
                await context.followUp(`${targetMember} have fun`)
                await sleep(60000)
                await targetMember.roles.remove(role)
                await context.followUp(`${targetMember} okay whatever enjoy being free again i guess`)
                return
            }
            await context.reply('❌ you dont have permission to manage roles')
            return
        }

        const target = await context.getUserOption('member', true)
        const targetMember = await context.guild.members.fetch(target)
        if (!targetMember) {
            await context.reply(`❌ ${context.pingMe} target member doesnt exist, FIX MEEEEEEEEE`)
            return
        }

        const role = await context.guild.roles.fetch('1331170880591757434')
        if (!role) {
            await context.reply(`❌ ${context.pingMe} banished role doesnt exist, wrong id? (\`1331170880591757434\`)`)
            return
        }

        const roles = targetMember.roles.cache.filter(role => role.name !== '@everyone')
        if (roles.find(r => r.id === role.id)) {
            await context.reply(`⚠️ they already have a banished role`)
            return
        }
        await targetMember.roles.add(role)
        await context.reply(`Banished ${targetMember} for anti-regime behavior`)

        const banishedChannel = await context.guild.channels.fetch('1331173298528321587')
        if (!banishedChannel) {
            await context.followUp(`⚠️ cant find the banished channel \`1331173298528321587\`, whatever, you cook bro`)
            return
        }
        if (banishedChannel.type !== ChannelType.GuildText) {
            await context.followUp(`⚠️ banish channel is not guild text, k i guess (\`1331173298528321587\`)`)
            return
        }
        await banishedChannel.send(`${targetMember} you've been banished for anti regime behavior, hope you enjoy your stay`)
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
