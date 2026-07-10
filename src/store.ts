import { Injectable } from '@nestjs/common';
import {
  Organization,
  Member,
  Wallet,
  Account,
  JournalEntry,
  PaymentIntent,
  Invoice,
  Escrow,
} from './types';

@Injectable()
export class MaringaStore {
  organizations = new Map<string, Organization>();
  members = new Map<string, Member[]>();
  wallets = new Map<string, Wallet>();
  accounts = new Map<string, Account>();
  journalEntries: JournalEntry[] = [];
  paymentIntents = new Map<string, PaymentIntent>();
  invoices = new Map<string, Invoice>();
  escrows = new Map<string, Escrow>();
  idempotencyKeys = new Map<string, { status: 'PROCESSING' | 'COMPLETED'; response: any }>();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // 1. Seed Organization
    const orgId = 'org_chidi';
    const organization: Organization = {
      id: orgId,
      name: 'Chidi Wholesale Enterprises',
      taxRegistrationNumber: 'RC-1928374',
      createdAt: new Date(),
    };
    this.organizations.set(orgId, organization);

    // 2. Seed Members
    const membersList: Member[] = [
      { id: 'mem_1', name: 'Chidi Okoye', email: 'chidi@wholesale.ng', role: 'Owner' },
      { id: 'mem_2', name: 'Fatoumata Diallo', email: 'fatoumata@maringa.co', role: 'Admin' },
      { id: 'mem_3', name: 'Adebayo Smith', email: 'adebayo@accounting.ng', role: 'Accountant' },
      { id: 'mem_4', name: 'Developer Dan', email: 'dan@fintech.dev', role: 'Developer' },
    ];
    this.members.set(orgId, membersList);

    // 3. Seed Wallets
    const initialWallets: Wallet[] = [
      {
        id: 'w_treasury_main',
        organizationId: orgId,
        type: 'TREASURY',
        name: 'Main Business Treasury',
        stellarAddress: 'GBX...TREASURY',
        availableBalance: { NGN: 25000000.0, USDC: 50000.0 },
        reservedBalance: { NGN: 0, USDC: 0 },
        createdAt: new Date(),
      },
      {
        id: 'w_settlement_main',
        organizationId: orgId,
        type: 'SETTLEMENT',
        name: 'Stellar Settlement Portal',
        stellarAddress: 'GCN...SETTLEMENT',
        availableBalance: { NGN: 0, USDC: 12500.0 },
        reservedBalance: { NGN: 0, USDC: 0 },
        createdAt: new Date(),
      },
      {
        id: 'w_supplier_882',
        organizationId: orgId,
        type: 'TREASURY',
        name: 'Aliko Cement Supplier Wallet',
        stellarAddress: 'GDK...SUPPLIER',
        availableBalance: { NGN: 15000000.0, USDC: 3000.0 },
        reservedBalance: { NGN: 0, USDC: 0 },
        createdAt: new Date(),
      },
      {
        id: 'w_agent_comm',
        organizationId: orgId,
        type: 'TREASURY',
        name: 'Logistics Agent Commission',
        stellarAddress: 'GAP...COMMISSION',
        availableBalance: { NGN: 1200000.0, USDC: 500.0 },
        reservedBalance: { NGN: 0, USDC: 0 },
        createdAt: new Date(),
      },
      {
        id: 'w_tax_reserve',
        organizationId: orgId,
        type: 'TAX',
        name: 'Withholding Tax Reserve',
        stellarAddress: 'GAW...TAXRESERVE',
        availableBalance: { NGN: 450000.0, USDC: 150.0 },
        reservedBalance: { NGN: 0, USDC: 0 },
        createdAt: new Date(),
      },
    ];

    for (const w of initialWallets) {
      this.wallets.set(w.id, w);
    }

    // 4. Seed Accounts & Ledger
    // For in-memory double entry ledger matching our wallets
    const ledgerId = 'ledger_main';
    const initialAccounts: Account[] = [
      { id: 'acc_treasury_ngn', ledgerId, code: '1000-TREASURY-NGN', name: 'Treasury Wallet NGN', type: 'ASSET', currency: 'NGN', createdAt: new Date() },
      { id: 'acc_treasury_usdc', ledgerId, code: '1000-TREASURY-USDC', name: 'Treasury Wallet USDC', type: 'ASSET', currency: 'USDC', createdAt: new Date() },
      { id: 'acc_settlement_usdc', ledgerId, code: '1010-SETTLE-USDC', name: 'Settlement Wallet USDC', type: 'ASSET', currency: 'USDC', createdAt: new Date() },
      { id: 'acc_supplier_ngn', ledgerId, code: '1020-SUPPLIER-NGN', name: 'Supplier Wallet NGN', type: 'ASSET', currency: 'NGN', createdAt: new Date() },
      { id: 'acc_supplier_usdc', ledgerId, code: '1020-SUPPLIER-USDC', name: 'Supplier Wallet USDC', type: 'ASSET', currency: 'USDC', createdAt: new Date() },
      { id: 'acc_agent_ngn', ledgerId, code: '1030-AGENT-NGN', name: 'Agent Wallet NGN', type: 'ASSET', currency: 'NGN', createdAt: new Date() },
      { id: 'acc_agent_usdc', ledgerId, code: '1030-AGENT-USDC', name: 'Agent Wallet USDC', type: 'ASSET', currency: 'USDC', createdAt: new Date() },
      { id: 'acc_tax_ngn', ledgerId, code: '2200-TAX-NGN', name: 'Tax Liability NGN', type: 'LIABILITY', currency: 'NGN', createdAt: new Date() },
      { id: 'acc_tax_usdc', ledgerId, code: '2200-TAX-USDC', name: 'Tax Liability USDC', type: 'LIABILITY', currency: 'USDC', createdAt: new Date() },
      { id: 'acc_ar_ngn', ledgerId, code: '1200-AR-NGN', name: 'Accounts Receivable NGN', type: 'ASSET', currency: 'NGN', createdAt: new Date() },
      { id: 'acc_ar_usdc', ledgerId, code: '1200-AR-USDC', name: 'Accounts Receivable USDC', type: 'ASSET', currency: 'USDC', createdAt: new Date() },
    ];

    for (const a of initialAccounts) {
      this.accounts.set(a.id, a);
    }
  }

  // Double entry transaction posting
  postJournalEntry(
    description: string,
    correlationId: string,
    lines: { accountId: string; amount: number; type: 'DEBIT' | 'CREDIT' }[],
  ): JournalEntry {
    // 1. Balance validation
    let debitsSum = 0;
    let creditsSum = 0;

    for (const line of lines) {
      if (line.type === 'DEBIT') debitsSum += line.amount;
      else creditsSum += line.amount;
    }

    // Handle floating point precision errors
    if (Math.abs(debitsSum - creditsSum) > 0.0001) {
      throw new Error(`Ledger Imbalance: Debits (${debitsSum}) must equal Credits (${creditsSum})`);
    }

    const journalEntry: JournalEntry = {
      id: 'je_' + Math.random().toString(36).substr(2, 9),
      ledgerId: 'ledger_main',
      description,
      correlationId,
      postedAt: new Date(),
      lines: lines.map((l) => ({ ...l })),
      createdAt: new Date(),
    };

    // Apply balances to wallets
    for (const line of lines) {
      const account = this.accounts.get(line.accountId);
      if (!account) continue;

      // Find the corresponding wallet
      let walletId = '';
      if (account.code.includes('TREASURY-NGN')) walletId = 'w_treasury_main';
      else if (account.code.includes('TREASURY-USDC')) walletId = 'w_treasury_main';
      else if (account.code.includes('SETTLE-USDC')) walletId = 'w_settlement_main';
      else if (account.code.includes('SUPPLIER-NGN')) walletId = 'w_supplier_882';
      else if (account.code.includes('SUPPLIER-USDC')) walletId = 'w_supplier_882';
      else if (account.code.includes('AGENT-NGN')) walletId = 'w_agent_comm';
      else if (account.code.includes('AGENT-USDC')) walletId = 'w_agent_comm';
      else if (account.code.includes('TAX-NGN')) walletId = 'w_tax_reserve';
      else if (account.code.includes('TAX-USDC')) walletId = 'w_tax_reserve';

      if (walletId) {
        const wallet = this.wallets.get(walletId);
        if (wallet) {
          const currency = account.currency;
          const currentBal = wallet.availableBalance[currency] || 0;

          // Debit increases assets, credit decreases assets
          // Credit increases liability, debit decreases liability
          let change = 0;
          if (account.type === 'ASSET') {
            change = line.type === 'DEBIT' ? line.amount : -line.amount;
          } else if (account.type === 'LIABILITY') {
            change = line.type === 'CREDIT' ? line.amount : -line.amount;
          }

          wallet.availableBalance[currency] = currentBal + change;
        }
      }
    }

    this.journalEntries.unshift(journalEntry);
    return journalEntry;
  }
}
