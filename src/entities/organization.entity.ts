import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Member } from './member.entity';
import { Wallet } from './wallet.entity';

@Entity('organizations')
export class Organization {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ name: 'tax_registration_number' })
  taxRegistrationNumber: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Member, (member) => member.organization)
  members: Member[];

  @OneToMany(() => Wallet, (wallet) => wallet.organization)
  wallets: Wallet[];
}
