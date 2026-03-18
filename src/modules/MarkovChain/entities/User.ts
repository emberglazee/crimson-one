import { Entity, Index, OneToMany, PrimaryColumn, Column } from 'typeorm'
import { Message, type Message as MessageType } from './Message'

export type UserPlatform = 'discord' | 'stoat'

@Entity('users')
@Index(['platform', 'id'], { unique: true })
export class User {
    @PrimaryColumn()
    id!: string

    @Column({
        type: 'text',
        default: 'discord'
    })
    platform!: UserPlatform

    @OneToMany(() => Message, message => message.author)
    messages!: MessageType[]
}
