import { Entity, PrimaryColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { TransactionLine } from './transaction-line.entity';

@Entity('journal_entries')
export class JournalEntry {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'ledger_id' })
  ledgerId: string;

  @Column()
  description: string;

  @Column({ name: 'correlation_id', unique: true })
  correlationId: string;

  @Column({ name: 'posted_at' })
  postedAt: Date;

  @OneToMany(() => TransactionLine, (line) => line.journalEntry, { cascade: true })
  lines: TransactionLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
