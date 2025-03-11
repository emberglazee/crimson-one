import { Entity, OneToMany, PrimaryColumn } from 'typeorm'
import { type Message } from './Message'

@Entity('users')
export class User {
    @PrimaryColumn()
    id!: string

    @OneToMany('Message', 'author')
    messages!: Message[]
}