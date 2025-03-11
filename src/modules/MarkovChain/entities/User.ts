import { Entity, OneToMany, PrimaryColumn } from 'typeorm'
import { Message } from './Message'

@Entity('users')
export class User {
    @PrimaryColumn()
    id!: string

    @OneToMany(() => Message, message => message.author)
    messages!: Message[]
}