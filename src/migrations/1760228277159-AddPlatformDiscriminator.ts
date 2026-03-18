import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPlatformDiscriminator1760228277159 implements MigrationInterface {
    name = 'AddPlatformDiscriminator1760228277159'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add platform column to messages table
        await queryRunner.query(`
            ALTER TABLE "messages" 
            ADD COLUMN "platform" text NOT NULL DEFAULT 'discord'
        `)

        // Create new composite indexes including platform
        await queryRunner.query(`
            CREATE INDEX "IDX_messages_platform_guild_channel_author" 
            ON "messages" ("platform", "guildId", "channelId", "authorId")
        `)

        await queryRunner.query(`
            CREATE INDEX "IDX_messages_platform_guild_author" 
            ON "messages" ("platform", "guildId", "authorId")
        `)

        await queryRunner.query(`
            CREATE INDEX "IDX_messages_platform_guild" 
            ON "messages" ("platform", "guildId")
        `)

        // Add platform column to guilds table
        await queryRunner.query(`
            ALTER TABLE "guilds" 
            ADD COLUMN "platform" text NOT NULL DEFAULT 'discord'
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_guilds_platform_id" 
            ON "guilds" ("platform", "id")
        `)

        // Add platform column to channels table
        await queryRunner.query(`
            ALTER TABLE "channels" 
            ADD COLUMN "platform" text NOT NULL DEFAULT 'discord'
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_channels_platform_id" 
            ON "channels" ("platform", "id")
        `)

        // Add platform column to users table
        await queryRunner.query(`
            ALTER TABLE "users" 
            ADD COLUMN "platform" text NOT NULL DEFAULT 'discord'
        `)

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_users_platform_id" 
            ON "users" ("platform", "id")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove indexes
        await queryRunner.query('DROP INDEX "IDX_users_platform_id"')
        await queryRunner.query('DROP INDEX "IDX_channels_platform_id"')
        await queryRunner.query('DROP INDEX "IDX_guilds_platform_id"')
        await queryRunner.query('DROP INDEX "IDX_messages_platform_guild"')
        await queryRunner.query(
            'DROP INDEX "IDX_messages_platform_guild_author"'
        )
        await queryRunner.query(
            'DROP INDEX "IDX_messages_platform_guild_channel_author"'
        )

        // Remove platform columns
        await queryRunner.query('ALTER TABLE "users" DROP COLUMN "platform"')
        await queryRunner.query('ALTER TABLE "channels" DROP COLUMN "platform"')
        await queryRunner.query('ALTER TABLE "guilds" DROP COLUMN "platform"')
        await queryRunner.query('ALTER TABLE "messages" DROP COLUMN "platform"')
    }
}
