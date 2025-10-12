import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMessageIndexes1760228277158 implements MigrationInterface {
    name = 'AddMessageIndexes1760228277158'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX "IDX_messages_guild_channel_author"
            ON "messages" ("guildId", "channelId", "authorId")
        `)

        await queryRunner.query(`
            CREATE INDEX "IDX_messages_guild_author"
            ON "messages" ("guildId", "authorId")
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX "IDX_messages_guild_author"')
        await queryRunner.query('DROP INDEX "IDX_messages_guild_channel_author"')
    }
}
