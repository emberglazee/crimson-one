import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('memories')
export class Memory {
    @PrimaryGeneratedColumn()
    id!: number

    @Column('text')
    text!: string

    @Column('int')
    importance!: number

    @CreateDateColumn()
    createdAt!: Date
}
