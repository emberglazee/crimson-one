import { ChannelType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types'
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
        const role = await context.guild.roles.fetch('1331170880591757434')
        if (!role) {
            await context.reply(`❌ ${context.pingMe} banished role doesnt exist, wrong id? (\`1331170880591757434\`)`)
            return
        }

        if (!context.member.permissions.has('ManageRoles')) {
            if (!chance(1)) {
                await context.reply('❌ you dont have permission to manage roles')
                return
            }
            await context.reply(`🥀 you know what what about i banish you instead`)
            const roles = context.member.roles.cache.filter(role => role.name !== '@everyone')
            if (roles.find(r => r.id === role.id)) {
                await context.followUp(`ha look ur banished already`)
                return
            }
            await context.member.roles.add(role)
            await context.followUp(`${context.member} have fun`)
            await sleep(60000)
            await context.member.roles.remove(role)
            await context.followUp(`${context.member} okay whatever enjoy being free again i guess`)
            return
        }

        const target = await context.getUserOption('member', true)
        const targetMember = await context.guild.members.fetch(target)
        if (!targetMember) {
            await context.reply(`❌ ${context.pingMe} target member doesnt exist, FIX MEEEEEEEEE`)
            return
        }
        if (targetMember.id === context.user.id) {
            await context.reply(`play stupid games win stupid prizes`)
            const roles = targetMember.roles.cache.filter(role => role.name !== '@everyone')
            if (roles.find(r => r.id === role.id)) {
                await context.followUp(`ha look ur banished already`)
                return
            }
            await targetMember.roles.add(role)
            await context.followUp(`${targetMember} have fun`)
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
