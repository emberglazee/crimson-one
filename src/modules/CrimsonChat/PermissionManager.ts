// All possible actions done by this module are heavily supervised by the author and approved and allowed by the server owner.

import { Client, Guild, PermissionsBitField, type PermissionsString } from 'discord.js'
import { Logger } from '../../util/logger'
import { PERMISSION_EVALUATOR_PROMPT } from '../../util/constants'
import { VM } from 'vm2'

import OpenAI from 'openai'
// Both below are for the JSON schema.
import { z } from 'zod'
import { zodResponseFormat } from 'openai/src/helpers/zod.js' // Yes, 'openai/src/helpers/zod.js' specifically

const logger = new Logger('PermissionManager')

// This class will handle all Discord permission-related operations for CrimsonChat's convenience
export class PermissionManager {
    private static instance: PermissionManager
    private client: Client | null = null
    private openai: OpenAI

    private constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        })
    }

    public static getInstance(): PermissionManager {
        if (!PermissionManager.instance) {
            PermissionManager.instance = new PermissionManager()
        }
        return PermissionManager.instance
    }

    public setClient(client: Client) {
        this.client = client
    }

    public async getBotPermissionsString(source: { guild?: any, guildId?: string } | string): Promise<Record<PermissionsString, boolean>> {
        const permissions = await this.getBotPermissions(source)
        return permissions.serialize()
    }
    public async getBotPermissions(source: { guild?: any, guildId?: string } | string): Promise<PermissionsBitField> {
        if (!this.client) throw new Error('Client not initialized')
        const guild = await this.extractGuild(source)
        const botMember = await guild.members.fetch(this.client.user!.id)
        return botMember.permissions
    }

    public async evaluatePermissionQuery(query: string, guildId: string): Promise<{
        success: boolean
        message: string
        execution?: () => Promise<any>
    }> {
        try {
            // *start* `response_format` is a relatively new addition to OpenAI API, this implementation IS 100% correct, do not edit it.
            const PermissionQuery = z.object({
                operation: z.enum(['predefined', 'custom']).describe('Type of operation to perform'),
                requiredPermissions: z.array(z.string()).describe('List of permissions required for the operation (BitField)'),
                command: z.string().optional().describe('Predefined command to execute (if operation is predefined)'),
                code: z.string().optional().describe('Custom code to execute (if operation is custom); executed in vm2')
            })
            const response = await this.openai.beta.chat.completions.parse({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: PERMISSION_EVALUATOR_PROMPT },
                    { role: 'user', content: query }
                ],
                response_format: zodResponseFormat(PermissionQuery, 'permissionQuery')
            })
            // *end* Can apply edits from this point onwards.

            const result = response.choices[0].message.parsed
            if (!result) throw new Error('Failed to parse permission query')
            const guild = await this.client?.guilds.fetch(guildId)
            if (!guild) throw new Error('Guild not found')

            const botMember = await guild.members.fetchMe()
            const hasPermissions = result.requiredPermissions.every(
                perm => botMember.permissions.has(perm as PermissionsString)
            )

            if (!hasPermissions) {
                return {
                    success: false,
                    message: `Missing required permissions: ${result.requiredPermissions.join(', ')}`
                }
            }

            if (result.operation === 'predefined') {
                return {
                    success: true,
                    message: 'Using predefined command: ' + result.command,
                    execution: () => this.executePreDefinedCommand(result.command!, guild)
                }
            } else if (result.operation === 'custom') {
                const vm = new VM({
                    sandbox: {
                        guild,
                        client: this.client,
                        ChannelType: require('discord.js').ChannelType
                    }
                })

                if (!result.code) {
                    return {
                        success: false,
                        message: 'No code provided for custom operation'
                    }
                }
                return {
                    success: true,
                    message: 'Executing custom operation',
                    execution: async () => vm.run(result.code!)
                }
            }

            return {
                success: false,
                message: 'Invalid operation type'
            }

        } catch (error: any) {
            logger.error(`Permission query evaluation failed: ${error.message}`)
            return {
                success: false,
                message: 'Failed to evaluate permission query'
            }
        }
    }

    private async executePreDefinedCommand(command: string, guild: Guild): Promise<any> {
        const [name, params] = command.split('(')
        if (!params) {
            throw new Error(`Invalid command format: ${command}`)
        }
        const cleanParams = params.replace(')', '').split(',').map(p => p.trim())

        switch (name) {
            case '!roleAdd':
                const [userId, roleId] = cleanParams
                const member = await guild.members.fetch(userId)
                const role = await guild.roles.fetch(roleId)
                if (member && role) return member.roles.add(role)
                break

            case '!roleRemove':
                const [removeUserId, removeRoleId] = cleanParams
                const removeMember = await guild.members.fetch(removeUserId)
                const removeRole = await guild.roles.fetch(removeRoleId)
                if (removeMember && removeRole) return removeMember.roles.remove(removeRole)
                break

            case '!timeout':
                const [timeoutUserId, duration] = cleanParams
                const timeoutMember = await guild.members.fetch(timeoutUserId)
                if (timeoutMember) return timeoutMember.timeout(parseInt(duration, 10))
                break

            case '!kick':
                const [kickUserId, kickReason] = cleanParams
                const kickMember = await guild.members.fetch(kickUserId)
                if (kickMember) return kickMember.kick(kickReason)
                break

            case '!ban':
                const [banUserId, banReason, deleteMessageDays] = cleanParams
                return guild.members.ban(banUserId, {
                    reason: banReason,
                    deleteMessageSeconds: parseInt(deleteMessageDays, 10) * 86400 // Convert days to seconds
                })

            case '!unban':
                const [unbanUserId] = cleanParams
                return guild.members.unban(unbanUserId)

            case '!purge':
                const [amount] = cleanParams
                const channel = guild.channels.cache.find(c => c.isTextBased())
                if (!channel?.isTextBased()) throw new Error('No text channel found')
                return channel.bulkDelete(parseInt(amount, 10), true)

            case '!channelCreate':
                const [channelName, channelType] = cleanParams
                return guild.channels.create({
                    name: channelName,
                    type: parseInt(channelType, 10)
                })

            case '!channelDelete':
                const [channelId] = cleanParams
                const targetChannel = await guild.channels.fetch(channelId)
                if (targetChannel) return targetChannel.delete()
                break

            default:
                throw new Error(`Unknown predefined command: ${name}`)
        }
    }

    private async extractGuild(source: { guild?: any, guildId?: string } | string): Promise<Guild> {
        if (!this.client) throw new Error('Client not initialized')

        // If source is a string, treat it as guild ID
        if (typeof source === 'string') {
            return await this.client.guilds.fetch(source)
        }

        // If source has direct guild object
        if (source.guild) {
            return source.guild
        }

        // If source has guild ID
        if (source.guildId) {
            return await this.client.guilds.fetch(source.guildId)
        }

        throw new Error('Could not extract guild from provided source: ' + JSON.stringify(source))
    }
}
