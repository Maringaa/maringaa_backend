import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { EscrowMilestone } from '../types';

@Entity('escrows')
export class Escrow {
  @PrimaryColumn()
  id: string; // The deployed Soroban contract address

  @Column({ name: 'client_address' })
  clientAddress: string;

  @Column({ name: 'contractor_address' })
  contractorAddress: string;

  @Column({ name: 'arbiter_address' })
  arbiterAddress: string;

  @Column({ name: 'token_address' })
  tokenAddress: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, name: 'total_amount' })
  totalAmount: number;

  @Column({ type: 'jsonb' })
  milestones: EscrowMilestone[];

  @Column({ name: 'milestones_released' })
  milestonesReleased: number;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    name: 'amount_deposited',
  })
  amountDeposited: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, name: 'amount_released' })
  amountReleased: number;

  @Column()
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
