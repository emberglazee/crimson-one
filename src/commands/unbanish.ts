import { ChannelType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types/types'
import { PING_EMBERGLAZE } from '../util/constants'
import { guildMember } from '../util/functions'

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
        const { reply, followUp, guild } = context
        if (!guild) {
            await reply(`❌ why is \`interaction.guild\` nonexistant i thought i set the interaction context type to guilds only wtf ${PING_EMBERGLAZE}`)
            return
        }

        const member = guildMember(context.member)
        if (!member) {
            await reply(`❌ for some reason i cant find you as a server member *sigh* ${PING_EMBERGLAZE}`)
            return
        }
        if (!member.permissions.has('ManageRoles')) {
            await reply('❌ you dont have permission to manage roles')
            return
        }

        const target = await context.getUserOption('member', true)
        const targetMember = await guild.members.fetch(target)
        if (!targetMember) {
            await reply(`❌ ${PING_EMBERGLAZE} target member doesnt exist, FIX MEEEEEEEEE`)
            return
        }

        const role = await guild.roles.fetch('1331170880591757434')
        if (!role) {
            await reply(`❌ ${PING_EMBERGLAZE} banished role doesnt exist, wrong id? (\`1331170880591757434\`)`)
            return
        }

        const roles = targetMember.roles.cache.filter(role => role.name !== '@everyone')
        if (!roles.find(r => r.id === role.id)) {
            await reply(`⚠️ they don't have the banished role`)
            return
        }
        await targetMember.roles.remove(role)
        await reply(`Unbanished ${targetMember} for good behavior`)

        const generalChannel = await guild.channels.fetch('1267488539503886386')
        if (!generalChannel) {
            await followUp(`⚠️ cant find the general channel \`1267488539503886386\`, whatever, you cook bro`)
            return
        }
        if (generalChannel.type !== ChannelType.GuildText) {
            await followUp(`⚠️ general channel is not guild text, k i guess (\`1267488539503886386\`)`)
            return
        }
        await generalChannel.send(`${targetMember} has been unbanished for good behavior, welcome back!`)
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
