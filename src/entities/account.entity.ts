import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { AccountType } from '../types';

@Entity('accounts')
export class Account {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'ledger_id' })
  ledgerId: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column()
  currency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
