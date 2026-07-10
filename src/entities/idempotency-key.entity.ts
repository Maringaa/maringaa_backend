import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn()
  key: string;

  @Column()
  status: 'PROCESSING' | 'COMPLETED';

  @Column({ type: 'jsonb', nullable: true })
  response: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
