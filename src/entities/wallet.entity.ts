import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Organization } from './organization.entity';
import { WalletType } from '../types';

@Entity('wallets')
export class Wallet {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, (org) => org.wallets)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar' })
  type: string;

  @Column()
  name: string;

  @Column({ name: 'stellar_address' })
  stellarAddress: string;

  @Column({ type: 'jsonb', name: 'available_balance' })
  availableBalance: { [currency: string]: number };

  @Column({ type: 'jsonb', name: 'reserved_balance' })
  reservedBalance: { [currency: string]: number };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
