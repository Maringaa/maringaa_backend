import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Organization,
  Member,
  Wallet,
  Account,
  JournalEntry,
  TransactionLine,
  PaymentIntent,
  Invoice,
  Escrow,
  IdempotencyKey,
} from './entities';

@Injectable()
export class MaringaStore implements OnModuleInit {
  constructor(
    @InjectRepository(Organization)
    public readonly orgRepo: Repository<Organization>,
    @InjectRepository(Member)
    public readonly memberRepo: Repository<Member>,
    @InjectRepository(Wallet)
    public readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Account)
    public readonly accountRepo: Repository<Account>,
    @InjectRepository(JournalEntry)
    public readonly journalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(TransactionLine)
    public readonly lineRepo: Repository<TransactionLine>,
    @InjectRepository(PaymentIntent)
    public readonly intentRepo: Repository<PaymentIntent>,
    @InjectRepository(Invoice)
    public readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Escrow)
    public readonly escrowRepo: Repository<Escrow>,
    @InjectRepository(IdempotencyKey)
    public readonly idempotencyRepo: Repository<IdempotencyKey>,
  ) {}

  async onModuleInit() {
    await this.seedData();
  }

  private async seedData() {
    // 1. Seed Organization
    const orgId = 'org_chidi';
    let organization = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!organization) {
      organization = this.orgRepo.create({
        id: orgId,
        name: 'Chidi Wholesale Enterprises',
        taxRegistrationNumber: 'RC-1928374',
        createdAt: new Date(),
      });
      await this.orgRepo.save(organization);
    }

    // 2. Seed Members
    const memberCount = await this.memberRepo.count();
    if (memberCount === 0) {
      const membersList = [
        {
          id: 'mem_1',
          name: 'Chidi Okoye',
          email: 'chidi@wholesale.ng',
          role: 'Owner' as const,
          organizationId: orgId,
        },
        {
          id: 'mem_2',
          name: 'Fatoumata Diallo',
          email: 'fatoumata@maringa.co',
          role: 'Admin' as const,
          organizationId: orgId,
        },
        {
          id: 'mem_3',
          name: 'Adebayo Smith',
          email: 'adebayo@accounting.ng',
          role: 'Accountant' as const,
          organizationId: orgId,
        },
        {
          id: 'mem_4',
          name: 'Developer Dan',
          email: 'dan@fintech.dev',
          role: 'Developer' as const,
          organizationId: orgId,
        },
      ];
      await this.memberRepo.save(this.memberRepo.create(membersList));
    }

    // 3. Seed Wallets
    const walletCount = await this.walletRepo.count();
    if (walletCount === 0) {
      const initialWallets = [
        {
          id: 'w_treasury_main',
          organizationId: orgId,
          type: 'TREASURY' as const,
          name: 'Main Business Treasury',
          stellarAddress: 'GBX...TREASURY',
          availableBalance: { NGN: 25000000.0, USDC: 50000.0 },
          reservedBalance: { NGN: 0, USDC: 0 },
        },
        {
          id: 'w_settlement_main',
          organizationId: orgId,
          type: 'SETTLEMENT' as const,
          name: 'Stellar Settlement Portal',
          stellarAddress: 'GCN...SETTLEMENT',
          availableBalance: { NGN: 0, USDC: 12500.0 },
          reservedBalance: { NGN: 0, USDC: 0 },
        },
        {
          id: 'w_supplier_882',
          organizationId: orgId,
          type: 'TREASURY' as const,
          name: 'Aliko Cement Supplier Wallet',
          stellarAddress: 'GDK...SUPPLIER',
          availableBalance: { NGN: 15000000.0, USDC: 3000.0 },
          reservedBalance: { NGN: 0, USDC: 0 },
        },
        {
          id: 'w_agent_comm',
          organizationId: orgId,
          type: 'TREASURY' as const,
          name: 'Logistics Agent Commission',
          stellarAddress: 'GAP...COMMISSION',
          availableBalance: { NGN: 1200000.0, USDC: 500.0 },
          reservedBalance: { NGN: 0, USDC: 0 },
        },
        {
          id: 'w_tax_reserve',
          organizationId: orgId,
          type: 'TAX' as const,
          name: 'Withholding Tax Reserve',
          stellarAddress: 'GAW...TAXRESERVE',
          availableBalance: { NGN: 450000.0, USDC: 150.0 },
          reservedBalance: { NGN: 0, USDC: 0 },
        },
      ];
      await this.walletRepo.save(this.walletRepo.create(initialWallets));
    }

    // 4. Seed Accounts & Ledger
    const accountCount = await this.accountRepo.count();
    if (accountCount === 0) {
      const ledgerId = 'ledger_main';
      const initialAccounts = [
        {
          id: 'acc_treasury_ngn',
          ledgerId,
          code: '1000-TREASURY-NGN',
          name: 'Treasury Wallet NGN',
          type: 'ASSET' as const,
          currency: 'NGN',
        },
        {
          id: 'acc_treasury_usdc',
          ledgerId,
          code: '1000-TREASURY-USDC',
          name: 'Treasury Wallet USDC',
          type: 'ASSET' as const,
          currency: 'USDC',
        },
        {
          id: 'acc_settlement_usdc',
          ledgerId,
          code: '1010-SETTLE-USDC',
          name: 'Settlement Wallet USDC',
          type: 'ASSET' as const,
          currency: 'USDC',
        },
        {
          id: 'acc_supplier_ngn',
          ledgerId,
          code: '1020-SUPPLIER-NGN',
          name: 'Supplier Wallet NGN',
          type: 'ASSET' as const,
          currency: 'NGN',
        },
        {
          id: 'acc_supplier_usdc',
          ledgerId,
          code: '1020-SUPPLIER-USDC',
          name: 'Supplier Wallet USDC',
          type: 'ASSET' as const,
          currency: 'USDC',
        },
        {
          id: 'acc_agent_ngn',
          ledgerId,
          code: '1030-AGENT-NGN',
          name: 'Agent Wallet NGN',
          type: 'ASSET' as const,
          currency: 'NGN',
        },
        {
          id: 'acc_agent_usdc',
          ledgerId,
          code: '1030-AGENT-USDC',
          name: 'Agent Wallet USDC',
          type: 'ASSET' as const,
          currency: 'USDC',
        },
        {
          id: 'acc_tax_ngn',
          ledgerId,
          code: '2200-TAX-NGN',
          name: 'Tax Liability NGN',
          type: 'LIABILITY' as const,
          currency: 'NGN',
        },
        {
          id: 'acc_tax_usdc',
          ledgerId,
          code: '2200-TAX-USDC',
          name: 'Tax Liability USDC',
          type: 'LIABILITY' as const,
          currency: 'USDC',
        },
        {
          id: 'acc_ar_ngn',
          ledgerId,
          code: '1200-AR-NGN',
          name: 'Accounts Receivable NGN',
          type: 'ASSET' as const,
          currency: 'NGN',
        },
        {
          id: 'acc_ar_usdc',
          ledgerId,
          code: '1200-AR-USDC',
          name: 'Accounts Receivable USDC',
          type: 'ASSET' as const,
          currency: 'USDC',
        },
      ];
      await this.accountRepo.save(this.accountRepo.create(initialAccounts));
    }
  }

  // Double entry transaction posting
  async postJournalEntry(
    description: string,
    correlationId: string,
    lines: { accountId: string; amount: number; type: 'DEBIT' | 'CREDIT' }[],
  ): Promise<JournalEntry> {
    // 1. Balance validation
    let debitsSum = 0;
    let creditsSum = 0;

    for (const line of lines) {
      if (line.type === 'DEBIT') debitsSum += line.amount;
      else creditsSum += line.amount;
    }

    if (Math.abs(debitsSum - creditsSum) > 0.0001) {
      throw new Error(
        `Ledger Imbalance: Debits (${debitsSum}) must equal Credits (${creditsSum})`,
      );
    }

    return this.orgRepo.manager.transaction(async (manager) => {
      // Save Journal Entry
      const je = manager.create(JournalEntry, {
        id: 'je_' + Math.random().toString(36).substr(2, 9),
        ledgerId: 'ledger_main',
        description,
        correlationId,
        postedAt: new Date(),
        createdAt: new Date(),
      });
      const savedJe = await manager.save(JournalEntry, je);

      // Save lines
      const lineEntities = lines.map((l) =>
        manager.create(TransactionLine, {
          journalEntryId: savedJe.id,
          accountId: l.accountId,
          amount: l.amount,
          type: l.type,
        }),
      );
      await manager.save(TransactionLine, lineEntities);
      savedJe.lines = lineEntities;

      // Apply balances to wallets
      for (const line of lines) {
        const account = await manager.findOne(Account, {
          where: { id: line.accountId },
        });
        if (!account) continue;

        let walletId = '';
        if (account.code.includes('TREASURY-NGN')) walletId = 'w_treasury_main';
        else if (account.code.includes('TREASURY-USDC'))
          walletId = 'w_treasury_main';
        else if (account.code.includes('SETTLE-USDC'))
          walletId = 'w_settlement_main';
        else if (account.code.includes('SUPPLIER-NGN'))
          walletId = 'w_supplier_882';
        else if (account.code.includes('SUPPLIER-USDC'))
          walletId = 'w_supplier_882';
        else if (account.code.includes('AGENT-NGN')) walletId = 'w_agent_comm';
        else if (account.code.includes('AGENT-USDC')) walletId = 'w_agent_comm';
        else if (account.code.includes('TAX-NGN')) walletId = 'w_tax_reserve';
        else if (account.code.includes('TAX-USDC')) walletId = 'w_tax_reserve';

        if (walletId) {
          const wallet = await manager.findOne(Wallet, {
            where: { id: walletId },
          });
          if (wallet) {
            const currency = account.currency;
            const currentBal = wallet.availableBalance[currency] || 0;

            let change = 0;
            if (account.type === 'ASSET') {
              change = line.type === 'DEBIT' ? line.amount : -line.amount;
            } else if (account.type === 'LIABILITY') {
              change = line.type === 'CREDIT' ? line.amount : -line.amount;
            }

            wallet.availableBalance[currency] = currentBal + change;
            wallet.availableBalance = { ...wallet.availableBalance }; // Trigger change detection
            await manager.save(Wallet, wallet);
          }
        }
      }

      return savedJe;
    });
  }
}
