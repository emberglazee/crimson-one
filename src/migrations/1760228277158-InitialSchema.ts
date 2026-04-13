import type { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialSchema1760228277158 implements MigrationInterface {
    name = 'InitialSchema1760228277158'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create guilds table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "guilds" (
                "id" text PRIMARY KEY NOT NULL
            )
        `)

        // Create users table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "users" (
                "id" text PRIMARY KEY NOT NULL
            )
        `)

        // Create channels table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "channels" (
                "id" text PRIMARY KEY NOT NULL,
                "guildId" text NOT NULL,
                "fullyCollected" boolean NOT NULL DEFAULT false,
                CONSTRAINT "FK_channels_guild" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE
            )
        `)

        // Create messages table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "messages" (
                "id" text PRIMARY KEY NOT NULL,
                "text" text NOT NULL,
                "authorId" text NOT NULL,
                "channelId" text NOT NULL,
                "guildId" text NOT NULL,
                "timestamp" bigint NOT NULL,
                CONSTRAINT "FK_messages_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_messages_channel" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_messages_guild" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE
            )
        `)

        // Create indexes for messages
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_messages_authorId" ON "messages" ("authorId")
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_messages_channelId" ON "messages" ("channelId")
        `)

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_messages_guildId" ON "messages" ("guildId")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order (respecting foreign keys)
        await queryRunner.query('DROP TABLE IF EXISTS "messages"')
        await queryRunner.query('DROP TABLE IF EXISTS "channels"')
        await queryRunner.query('DROP TABLE IF EXISTS "users"')
        await queryRunner.query('DROP TABLE IF EXISTS "guilds"')
    }
}
