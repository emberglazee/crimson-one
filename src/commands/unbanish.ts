import { ChannelType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types/types'
import { PING_EMBERGLAZE } from '../util/constants'

export default {
    data: new SlashCommandBuilder()
        .setName('unbanish')
        .setDescription('Remove the `banished` role from a server member')
        .addUserOption(uo => uo
            .setName('member')
            .setDescription('Server member to unbanish')
            .setRequired(true)
        ).setContexts(InteractionContextType.Guild),
    async execute(context) {
        if (!context.member.permissions.has('ManageRoles')) {
            await context.reply('❌ you dont have permission to manage roles')
            return
        }

        const target = await context.getUserOption('member', true)
        const targetMember = await context.guild.members.fetch(target)
        if (!targetMember) {
            await context.reply(`❌ ${PING_EMBERGLAZE} target member doesnt exist, FIX MEEEEEEEEE`)
            return
        }

        const role = await context.guild.roles.fetch('1331170880591757434')
        if (!role) {
            await context.reply(`❌ ${PING_EMBERGLAZE} banished role doesnt exist, wrong id? (\`1331170880591757434\`)`)
            return
        }

        const roles = targetMember.roles.cache.filter(role => role.name !== '@everyone')
        if (!roles.find(r => r.id === role.id)) {
            await context.reply(`⚠️ they don't have the banished role`)
            return
        }

        if (targetMember.id === context.user.id) {
            await context.reply(`💔 what did you think was gonna happen?`)
            return
        }

        await targetMember.roles.remove(role)
        await context.reply(`Unbanished ${targetMember} for good behavior`)

        const generalChannel = await context.guild.channels.fetch('1267488539503886386')
        if (!generalChannel) {
            await context.followUp(`⚠️ cant find the general channel \`1267488539503886386\`, whatever, you cook bro`)
            return
        }
        if (generalChannel.type !== ChannelType.GuildText) {
            await context.followUp(`⚠️ general channel is not guild text, k i guess (\`1267488539503886386\`)`)
            return
        }
        await generalChannel.send(`${targetMember} has been unbanished for good behavior, welcome back!`)
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
