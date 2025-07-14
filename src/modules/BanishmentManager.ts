import { Logger } from '../util/logger'
const logger = new Logger('BanishmentManager')

import { EventEmitter } from 'tseep'
import { Client, GuildMember, User } from 'discord.js'
import fs from 'fs/promises'
import path from 'path'
import { parseDuration } from '../util/functions'

const BANISHMENT_STORE_PATH = path.join(process.cwd(), 'data/timed-banishments.json')
const BANISHED_ROLE_ID = '1331170880591757434'

export type BanishmentType = 'manual' | 'command' | 'crimsonchat'

interface TimedBanishment {
    guildId: string
    userId: string
    unbanishAt: string // Stored as ISO string
}

export interface BanishmentEvent {
    member: GuildMember
    actor: User
    type: BanishmentType
    duration?: bigint // in seconds
    reason?: string
}

export interface UnbanishmentEvent {
    member: GuildMember
    actor: User
    type: BanishmentType
    reason?: string
}

export class BanishmentManager extends EventEmitter<{
    userBanished: (data: BanishmentEvent) => void
    userUnbanished: (data: UnbanishmentEvent) => void
}> {
    private static instance: BanishmentManager
    private client!: Client<true>
    private activeTimeouts = new Map<string, NodeJS.Timeout>()
    private actionsInProgress = new Set<string>() // Key: userId

    private constructor() {
        super()
    }

    public static getInstance(): BanishmentManager {
        if (!BanishmentManager.instance) {
            BanishmentManager.instance = new BanishmentManager()
        }
        return BanishmentManager.instance
    }

    public setClient(client: Client<true>): this {
        this.client = client
        return this
    }

    public async init() {
        await this.loadBanishments()
        // Start a periodic re-check for very long banishments that exceed setTimeout's limit
        setInterval(() => this.recheckBanishments(), 24 * 60 * 60 * 1000) // Check once every 24 hours
        logger.ok('BanishmentManager initialized.')
    }

    private async getBanishments(): Promise<TimedBanishment[]> {
        try {
            const data = await fs.readFile(BANISHMENT_STORE_PATH, 'utf-8')
            return JSON.parse(data)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return []
            }
            throw error
        }
    }

    private async writeBanishments(banishments: TimedBanishment[]) {
        await fs.mkdir(path.dirname(BANISHMENT_STORE_PATH), { recursive: true })
        await fs.writeFile(BANISHMENT_STORE_PATH, JSON.stringify(banishments, null, 2))
    }

    private async loadBanishments() {
        const banishments = await this.getBanishments()
        const now = Date.now()

        for (const ban of banishments) {
            const unbanishAt = new Date(ban.unbanishAt).getTime()
            if (unbanishAt <= now) {
                this.unbanishUser(ban.guildId, ban.userId, this.client.user, 'manual', 'Timed banishment expired during downtime.').catch(e => logger.error(`Failed to process expired banishment for ${ban.userId}: ${(e as Error).message}`))
            } else {
                this.scheduleUnban(ban.guildId, ban.userId, unbanishAt)
            }
        }
    }

    private scheduleUnban(guildId: string, userId: string, unbanishAt: number) {
        const key = `${guildId}-${userId}`
        const delay = unbanishAt - Date.now()

        if (this.activeTimeouts.has(key)) {
            clearTimeout(this.activeTimeouts.get(key))
        }

        if (delay > 0) {
            // setTimeout can handle delays up to 2^31 - 1 milliseconds (about 24.8 days)
            // For longer durations, we rely on the bot restarting and re-evaluating.
            if (delay > 2147483647) {
                logger.warn(`Banishment for ${userId} is longer than 24.8 days. It will be applied upon next bot restart if it occurs after expiration.`)
                return
            }
            const timeout = setTimeout(() => {
                this.unbanishUser(guildId, userId, this.client.user, 'manual', 'Timed banishment expired.').catch(e => logger.error(`Scheduled unbanish failed for ${userId}: ${(e as Error).message}`))
            }, delay)
            this.activeTimeouts.set(key, timeout)
        }
    }

    public isActionInProgress(userId: string): boolean {
        return this.actionsInProgress.has(userId)
    }

    public async banish(member: GuildMember, actor: User, type: BanishmentType, durationStr: string | null, reason?: string) {
        this.actionsInProgress.add(member.id)
        try {
            const role = await member.guild.roles.fetch(BANISHED_ROLE_ID)
            if (!role) {
                throw new Error(`Banishment role (ID: ${BANISHED_ROLE_ID}) not found in guild ${member.guild.name}.`)
            }

            await member.roles.add(role, reason)

            const durationSec = durationStr ? parseDuration(durationStr) : null

            this.emit('userBanished', { member, actor, type, duration: durationSec ?? undefined, reason })

            if (durationSec) {
                const unbanishAt = Date.now() + Number(durationSec * 1000n)
                const banishments = await this.getBanishments()
                const existingIndex = banishments.findIndex(b => b.userId === member.id && b.guildId === member.guild.id)
                if (existingIndex > -1) {
                    banishments[existingIndex].unbanishAt = new Date(unbanishAt).toISOString()
                } else {
                    banishments.push({ guildId: member.guild.id, userId: member.id, unbanishAt: new Date(unbanishAt).toISOString() })
                }
                await this.writeBanishments(banishments)
                this.scheduleUnban(member.guild.id, member.id, unbanishAt)
            }
        } finally {
            setTimeout(() => this.actionsInProgress.delete(member.id), 2000)
        }
    }

    public async unbanish(member: GuildMember, actor: User, type: BanishmentType, reason?: string) {
        this.actionsInProgress.add(member.id)
        try {
            await this.unbanishUser(member.guild.id, member.id, actor, type, reason)
        } finally {
            setTimeout(() => this.actionsInProgress.delete(member.id), 2000)
        }
    }

    private async unbanishUser(guildId: string, userId: string, actor: User, type: BanishmentType, reason?: string) {
        const guild = await this.client.guilds.fetch(guildId).catch(() => null)
        if (!guild) {
            logger.warn(`Cannot unbanish user ${userId}: Guild ${guildId} not found.`)
            return
        }
        const member = await guild.members.fetch(userId).catch(() => null)
        if (!member) {
            logger.warn(`Cannot unbanish user ${userId}: Member not found in guild ${guildId}.`)
            return
        }

        const role = await guild.roles.fetch(BANISHED_ROLE_ID).catch(() => null)
        if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role, reason)
            this.emit('userUnbanished', { member, actor, type, reason })
        }

        const key = `${guildId}-${userId}`
        if (this.activeTimeouts.has(key)) {
            clearTimeout(this.activeTimeouts.get(key))
            this.activeTimeouts.delete(key)
        }
        const banishments = await this.getBanishments()
        const updatedBanishments = banishments.filter(b => !(b.userId === userId && b.guildId === guildId))
        if (banishments.length !== updatedBanishments.length) {
            await this.writeBanishments(updatedBanishments)
        }
    }

    public reportManualBanishment(member: GuildMember, actor: User) {
        this.emit('userBanished', { member, actor, type: 'manual' })
    }

    public reportManualUnbanishment(member: GuildMember, actor: User) {
        this.emit('userUnbanished', { member, actor, type: 'manual' })
    }

    private async recheckBanishments() {
        logger.info('Periodically re-checking for expired long-term banishments...')
        const banishments = await this.getBanishments()
        const now = Date.now()

        for (const ban of banishments) {
            const unbanishAt = new Date(ban.unbanishAt).getTime()
            if (unbanishAt <= now) {
                // This ban has expired, but might not have been caught by setTimeout
                // or might have expired during downtime.
                this.unbanishUser(ban.guildId, ban.userId, this.client.user, 'manual', 'Timed banishment expired.')
                    .catch(e => logger.error(`Failed to process expired banishment for ${ban.userId} during periodic check: ${(e as Error).message}`))
            }
        }
    }
}
