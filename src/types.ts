export type WalletType = 'TREASURY' | 'SETTLEMENT' | 'ESCROW' | 'TAX';
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type EntryType = 'DEBIT' | 'CREDIT';
export type PaymentIntentStatus = 'created' | 'authorized' | 'captured' | 'settled' | 'failed';
export type InvoiceStatus = 'pending' | 'paid';

export interface Organization {
  id: string;
  name: string;
  taxRegistrationNumber: string;
  createdAt: Date;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Accountant' | 'Developer';
}

export interface Wallet {
  id: string;
  organizationId: string;
  type: WalletType;
  name: string;
  stellarAddress: string;
  availableBalance: { [currency: string]: number };
  reservedBalance: { [currency: string]: number };
  createdAt: Date;
}

export interface Account {
  id: string;
  ledgerId: string;
  code: string;
  name: string;
  type: AccountType;
  currency: string;
  createdAt: Date;
}

export interface TransactionLine {
  accountId: string;
  amount: number;
  type: EntryType;
}

export interface JournalEntry {
  id: string;
  ledgerId: string;
  description: string;
  correlationId: string;
  postedAt: Date;
  lines: TransactionLine[];
  createdAt: Date;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  description: string;
  status: PaymentIntentStatus;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface SplitRule {
  recipientWalletId: string;
  percentage: number;
  isWithholdingTax?: boolean;
}

export interface Invoice {
  id: string;
  customerId: string;
  amount: number;
  status: InvoiceStatus;
  automationRules: {
    splits: SplitRule[];
    triggerStellarSettlement: boolean;
  };
  createdAt: Date;
}

export interface EscrowMilestone {
  id: number;
  description: string;
  percentage: number;
}

export interface Escrow {
  id: string;
  clientWalletId: string;
  contractorWalletId: string;
  arbiterWalletId: string;
  token: string;
  totalAmount: number;
  milestones: EscrowMilestone[];
  milestonesReleased: number;
  amountDeposited: number;
  status: 'created' | 'funded' | 'completed' | 'refunded';
  stellarContractAddress?: string;
  createdAt: Date;
}
