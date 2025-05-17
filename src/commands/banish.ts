import { ChannelType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { GuildSlashCommand } from '../types/types'

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
        const { reply, followUp, guild, pingMe } = context
        if (!guild) {
            await reply(`❌ why is \`interaction.guild\` nonexistant i thought i set the interaction context type to guilds only wtf ${pingMe}`)
            return
        }

        const member = context.member
        if (!member) {
            await reply(`❌ for some reason i cant find you as a server member *sigh* ${pingMe}`)
            return
        }
        if (!member.permissions.has('ManageRoles')) {
            await reply('❌ you dont have permission to manage roles')
            return
        }

        const target = await context.getUserOption('member', true)
        const targetMember = await guild.members.fetch(target)
        if (!targetMember) {
            await reply(`❌ ${pingMe} target member doesnt exist, FIX MEEEEEEEEE`)
            return
        }

        const role = await guild.roles.fetch('1331170880591757434')
        if (!role) {
            await reply(`❌ ${pingMe} banished role doesnt exist, wrong id? (\`1331170880591757434\`)`)
            return
        }

        const roles = targetMember.roles.cache.filter(role => role.name !== '@everyone')
        if (roles.find(r => r.id === role.id)) {
            await reply(`⚠️ they already have a banished role`)
            return
        }
        await targetMember.roles.add(role)
        await reply(`Banished ${targetMember} for anti-regime behavior`)

        const banishedChannel = await guild.channels.fetch('1331173298528321587')
        if (!banishedChannel) {
            await followUp(`⚠️ cant find the banished channel \`1331173298528321587\`, whatever, you cook bro`)
            return
        }
        if (banishedChannel.type !== ChannelType.GuildText) {
            await followUp(`⚠️ banish channel is not guild text, k i guess (\`1331173298528321587\`)`)
            return
        }
        await banishedChannel.send(`${targetMember} you've been banished for anti regime behavior, hope you enjoy your stay`)
    },
    guildId: '958518067690868796'
} satisfies GuildSlashCommand
