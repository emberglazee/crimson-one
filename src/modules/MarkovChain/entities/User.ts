import { Entity, OneToMany, PrimaryColumn } from 'typeorm'

@Entity('users')
export class User {
    @PrimaryColumn()
    id!: string

    @OneToMany('Message', 'author')
    messages!: any[]
}