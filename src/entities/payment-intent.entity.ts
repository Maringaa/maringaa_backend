import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { PaymentIntentStatus } from '../types';

@Entity('payment_intents')
export class PaymentIntent {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: number;

  @Column()
  currency: string;

  @Column({ name: 'payment_method' })
  paymentMethod: string;

  @Column()
  description: string;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
