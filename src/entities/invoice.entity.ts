import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { InvoiceStatus, SplitRule } from '../types';

@Entity('invoices')
export class Invoice {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: number;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'jsonb', name: 'automation_rules' })
  automationRules: {
    splits: SplitRule[];
    triggerStellarSettlement: boolean;
  };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
