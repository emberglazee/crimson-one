import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../types/types'

export default {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Execute git pull, bun install, and restart the bot'),
    async execute(context) {
        const { reply, deferReply, editReply, myId } = context

        const user = context.user
        if (user.id !== myId) {
            await reply('❌ You, solely, are responsible for this')
            return
        }

        await deferReply()

        try {
            // Execute git pull
            const gitProcess = Bun.spawn(['git', 'pull'])
            const gitOutput = await new Response(gitProcess.stdout).text()
            const gitError = await new Response(gitProcess.stderr).text()
            await editReply(`\`\`\`\nGit pull output:\n${gitOutput}\n${gitError}\`\`\``)

            // Execute bun install
            const bunProcess = Bun.spawn(['bun', 'install'])
            const bunOutput = await new Response(bunProcess.stdout).text()
            const bunError = await new Response(bunProcess.stderr).text()
            await editReply(`\`\`\`\nBun install output:\n${bunOutput}\n${bunError}\`\`\``)

            // Execute pm2 restart
            const pm2Process = Bun.spawn(['pm2', 'restart', 'crimson-one'])
            const pm2Output = await new Response(pm2Process.stdout).text()
            const pm2Error = await new Response(pm2Process.stderr).text()
            await editReply(`\`\`\`\nPM2 restart output:\n${pm2Output}\n${pm2Error}\`\`\``)

            await editReply('✅ All operations completed successfully!')
        } catch (error) {
            await editReply(`❌ Error executing commands:\n\`\`\`\n${error}\n\`\`\``)
        }
    }
} satisfies SlashCommand
