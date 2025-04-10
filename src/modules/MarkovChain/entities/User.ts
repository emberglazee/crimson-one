import { Entity, OneToMany, PrimaryColumn } from 'typeorm'
import { Message, type Message as MessageType } from './Message'

@Entity('users')
export class User {
    @PrimaryColumn()
    id!: string

    @OneToMany(() => Message, message => message.author)
    messages!: MessageType[]
}
