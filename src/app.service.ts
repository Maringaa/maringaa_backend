import { Injectable, BadRequestException } from '@nestjs/common';
import { MaringaStore } from './store';
import { EventsGateway } from './events.gateway';
import {
  Organization,
  Member,
  Wallet,
  Account,
  PaymentIntent,
  Invoice,
  Escrow,
  JournalEntry,
} from './types';

@Injectable()
export class AppService {
  constructor(
    private readonly store: MaringaStore,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Auth Mock
  login(email: string) {
    const orgId = 'org_chidi';
    const members = this.store.members.get(orgId) || [];
    const member = members.find((m) => m.email === email);

    if (!member) {
      throw new BadRequestException('User not found in organization.');
    }

    return {
      success: true,
      token: 'maringa_jwt_mock_token_' + Math.random().toString(36).substr(2, 9),
      user: member,
      organization: this.store.organizations.get(orgId),
    };
  }

  // Organizations
  createOrganization(name: string, taxId: string): Organization {
    const orgId = 'org_' + Math.random().toString(36).substr(2, 9);
    const org: Organization = {
      id: orgId,
      name,
      taxRegistrationNumber: taxId,
      createdAt: new Date(),
    };
    this.store.organizations.set(orgId, org);

    // Seed default wallets for the new organization
    this.createWallet(orgId, 'TREASURY', 'NGN', 'Business Cash Wallet');
    this.createWallet(orgId, 'TREASURY', 'USDC', 'Stellar Treasury');

    return org;
  }

  getOrganizationMembers(orgId: string): Member[] {
    return this.store.members.get(orgId) || [];
  }

  // Wallets
  createWallet(orgId: string, type: 'TREASURY' | 'SETTLEMENT' | 'ESCROW' | 'TAX', currency: string, name: string): Wallet {
    const walletId = 'w_' + Math.random().toString(36).substr(2, 9);
    const wallet: Wallet = {
      id: walletId,
      organizationId: orgId,
      type,
      name,
      stellarAddress: 'G' + Math.random().toString(36).substr(2, 10).toUpperCase() + '...MOCK',
      availableBalance: { [currency]: 0 },
      reservedBalance: { [currency]: 0 },
      createdAt: new Date(),
    };

    // Register corresponding ledger account
    const accCode = `1000-${type}-${currency}-${walletId.toUpperCase()}`;
    const account: Account = {
      id: 'acc_' + walletId,
      ledgerId: 'ledger_main',
      code: accCode,
      name: `${name} (${currency})`,
      type: 'ASSET',
      currency,
      createdAt: new Date(),
    };

    this.store.accounts.set(account.id, account);
    this.store.wallets.set(walletId, wallet);

    return wallet;
  }

  getWallet(id: string): Wallet {
    const wallet = this.store.wallets.get(id);
    if (!wallet) throw new BadRequestException('Wallet not found.');
    return wallet;
  }

  getWallets(orgId: string): Wallet[] {
    return Array.from(this.store.wallets.values()).filter((w) => w.organizationId === orgId);
  }

  internalTransfer(fromId: string, toId: string, amount: number, currency: string) {
    const fromW = this.getWallet(fromId);
    const toW = this.getWallet(toId);

    if ((fromW.availableBalance[currency] || 0) < amount) {
      throw new BadRequestException('Insufficient funds in source wallet.');
    }

    // Map to accounts
    const fromAcc = Array.from(this.store.accounts.values()).find(
      (a) => a.code.includes(fromId.toUpperCase()) || (fromId === 'w_treasury_main' && a.code.includes('TREASURY-' + currency)),
    );
    const toAcc = Array.from(this.store.accounts.values()).find(
      (a) => a.code.includes(toId.toUpperCase()) || (toId === 'w_treasury_main' && a.code.includes('TREASURY-' + currency)) || (toId === 'w_supplier_882' && a.code.includes('SUPPLIER-' + currency)) || (toId === 'w_agent_comm' && a.code.includes('AGENT-' + currency)) || (toId === 'w_tax_reserve' && a.code.includes('TAX-' + currency)) || (toId === 'w_settlement_main' && a.code.includes('SETTLE-' + currency)),
    );

    if (!fromAcc || !toAcc) {
      throw new BadRequestException('Matching ledger accounts not found.');
    }

    // Post double entry journal entry
    const entry = this.store.postJournalEntry(
      `Internal Transfer from ${fromW.name} to ${toW.name}`,
      `tx_corr_${Date.now()}`,
      [
        { accountId: fromAcc.id, amount, type: 'CREDIT' }, // Credit decreases Asset
        { accountId: toAcc.id, amount, type: 'DEBIT' },  // Debit increases Asset
      ],
    );

    // Emit balance change events
    this.eventsGateway.emitEvent('wallet.balance.debited', {
      walletId: fromId,
      asset: currency,
      amount: amount.toString(),
      newBalance: fromW.availableBalance[currency].toString(),
      reference: entry.id,
    });

    this.eventsGateway.emitEvent('wallet.balance.funded', {
      walletId: toId,
      asset: currency,
      amount: amount.toString(),
      newBalance: toW.availableBalance[currency].toString(),
      reference: entry.id,
    });

    return entry;
  }

  // Payments & Payment Intents
  createPaymentIntent(amount: number, currency: string, paymentMethod: string, description: string, metadata: any): PaymentIntent {
    const id = 'pi_' + Math.random().toString(36).substr(2, 9);
    const intent: PaymentIntent = {
      id,
      amount,
      currency,
      paymentMethod,
      description,
      status: 'created',
      metadata: metadata || {},
      createdAt: new Date(),
    };

    this.store.paymentIntents.set(id, intent);
    return intent;
  }

  getPaymentIntent(id: string): PaymentIntent {
    const intent = this.store.paymentIntents.get(id);
    if (!intent) throw new BadRequestException('Payment intent not found.');
    return intent;
  }

  // Saga: Settle Payment & Run Revenue Split
  settlePaymentIntent(id: string): PaymentIntent {
    const intent = this.getPaymentIntent(id);
    if (intent.status === 'settled') return intent;

    intent.status = 'settled';

    // 1. Post Ledger Entry: Cash Deposit (Debit Cash, Credit AR)
    const treasuryAcc = Array.from(this.store.accounts.values()).find((a) => a.code.includes(`TREASURY-${intent.currency}`));
    const arAcc = Array.from(this.store.accounts.values()).find((a) => a.code.includes(`AR-${intent.currency}`));

    if (treasuryAcc && arAcc) {
      this.store.postJournalEntry(
        `Payment Settled for ${intent.description}`,
        `pi_settle_${id}`,
        [
          { accountId: arAcc.id, amount: intent.amount, type: 'CREDIT' }, // Credit decreases Accounts Receivable
          { accountId: treasuryAcc.id, amount: intent.amount, type: 'DEBIT' }, // Debit increases Treasury Cash
        ],
      );
    }

    // Broadcast payment settled event
    this.eventsGateway.emitEvent('payments.intent.settled', {
      paymentIntentId: id,
      organizationId: 'org_chidi',
      amount: intent.amount.toString(),
      currency: intent.currency,
      paymentMethod: intent.paymentMethod,
      settledAt: new Date().toISOString(),
      metadata: intent.metadata,
    });

    // 2. Check if linked to an Invoice for revenue split
    const invoiceId = intent.metadata?.invoiceId;
    if (invoiceId) {
      const invoice = this.store.invoices.get(invoiceId);
      if (invoice && invoice.status === 'pending') {
        invoice.status = 'paid';
        this.runRevenueSplit(invoice, intent.currency);
      }
    }

    return intent;
  }

  // Saga Component: Revenue Split
  private runRevenueSplit(invoice: Invoice, currency: string) {
    const splits = invoice.automationRules.splits;
    const totalAmount = invoice.amount;

    console.log(`Running revenue split saga for Invoice: ${invoice.id}, total: ${totalAmount} ${currency}`);

    // We split out of the Main Treasury Wallet
    const treasuryWalletId = 'w_treasury_main';

    for (const split of splits) {
      const splitAmount = (totalAmount * split.percentage) / 100;
      if (splitAmount <= 0) continue;

      // Execute internal wallet-to-wallet transfers
      try {
        this.internalTransfer(treasuryWalletId, split.recipientWalletId, splitAmount, currency);
      } catch (err) {
        console.error(`Saga Step Failed: Split payment to ${split.recipientWalletId} failed:`, err.message);
      }
    }

    // 3. Stellar settlement simulation
    if (invoice.automationRules.triggerStellarSettlement && currency === 'USDC') {
      this.simulateStellarSettlement(invoice);
    }
  }

  // Saga Component: Stellar on-chain distribution simulation
  private simulateStellarSettlement(invoice: Invoice) {
    console.log(`[Stellar Settlement Saga] Distributing ${invoice.amount} USDC via RevenueSplitter Soroban Contract...`);

    // Simulate RPC lag and event indexer syncing
    setTimeout(() => {
      this.eventsGateway.emitEvent('wallet.balance.funded', {
        walletId: 'w_settlement_main',
        asset: 'USDC',
        amount: invoice.amount.toString(),
        newBalance: (this.getWallet('w_settlement_main').availableBalance['USDC'] || 0).toString(),
        reference: `stellar_payout_${Math.random().toString(36).substr(2, 9)}`,
      });
      console.log(`[Stellar Settlement Saga] On-chain Soroban splits successfully indexed.`);
    }, 2000);
  }

  // Invoices
  createInvoice(customerId: string, amount: number, automationRules: any): Invoice {
    const id = 'inv_' + Math.random().toString(36).substr(2, 9);
    const invoice: Invoice = {
      id,
      customerId,
      amount,
      status: 'pending',
      automationRules: automationRules || { splits: [], triggerStellarSettlement: false },
      createdAt: new Date(),
    };

    this.store.invoices.set(id, invoice);
    return invoice;
  }

  getInvoices(): Invoice[] {
    return Array.from(this.store.invoices.values());
  }

  // Escrow Service
  createEscrow(
    amount: number,
    asset: string,
    contractorWalletId: string,
    milestones: any[],
  ): Escrow {
    const id = 'esc_' + Math.random().toString(36).substr(2, 9);
    const escrow: Escrow = {
      id,
      clientWalletId: 'w_treasury_main',
      contractorWalletId,
      arbiterWalletId: 'w_agent_comm', // Use agent wallet as arbiter mock
      token: asset,
      totalAmount: amount,
      milestones: milestones || [],
      milestonesReleased: 0,
      amountDeposited: 0,
      status: 'created',
      stellarContractAddress: 'CC' + Math.random().toString(36).substr(2, 12).toUpperCase() + '...MOCK',
      createdAt: new Date(),
    };

    this.store.escrows.set(id, escrow);

    this.eventsGateway.emitEvent('escrow.contract.created', {
      escrowId: id,
      sorobanContractAddress: escrow.stellarContractAddress,
      clientWalletId: escrow.clientWalletId,
      contractorWalletId: escrow.contractorWalletId,
      totalAmount: amount.toString(),
      asset,
      milestonesCount: escrow.milestones.length,
    });

    return escrow;
  }

  getEscrow(id: string): Escrow {
    const escrow = this.store.escrows.get(id);
    if (!escrow) throw new BadRequestException('Escrow not found.');
    return escrow;
  }

  getEscrows(): Escrow[] {
    return Array.from(this.store.escrows.values());
  }

  fundEscrow(id: string, amount: number) {
    const escrow = this.getEscrow(id);
    if (escrow.status !== 'created') throw new BadRequestException('Escrow already funded or completed.');

    const clientWallet = this.getWallet(escrow.clientWalletId);
    if ((clientWallet.availableBalance[escrow.token] || 0) < amount) {
      throw new BadRequestException('Insufficient client funds to lock in escrow.');
    }

    // Reserve funds in the client wallet
    clientWallet.availableBalance[escrow.token] -= amount;
    clientWallet.reservedBalance[escrow.token] = (clientWallet.reservedBalance[escrow.token] || 0) + amount;

    escrow.amountDeposited += amount;
    if (escrow.amountDeposited >= escrow.totalAmount) {
      escrow.status = 'funded';
    }

    // Emit event
    this.eventsGateway.emitEvent('wallet.balance.debited', {
      walletId: escrow.clientWalletId,
      asset: escrow.token,
      amount: amount.toString(),
      newBalance: clientWallet.availableBalance[escrow.token].toString(),
      reference: `escrow_fund_${id}`,
    });

    return escrow;
  }

  releaseEscrowMilestone(id: string, milestoneId: number) {
    const escrow = this.getEscrow(id);
    if (escrow.status !== 'funded') throw new BadRequestException('Escrow is not funded.');

    if (milestoneId !== escrow.milestonesReleased + 1) {
      throw new BadRequestException('Milestones must be released sequentially.');
    }

    const milestone = escrow.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new BadRequestException('Milestone not found.');

    const clientWallet = this.getWallet(escrow.clientWalletId);
    const contractorWallet = this.getWallet(escrow.contractorWalletId);

    // Calculate share amount
    const shareAmount = (escrow.totalAmount * milestone.percentage) / 100;

    if (escrow.amountDeposited < shareAmount) {
      throw new BadRequestException('Insufficient deposited escrow balance.');
    }

    // Transfer from client's reserved balance to contractor's available balance
    clientWallet.reservedBalance[escrow.token] -= shareAmount;
    contractorWallet.availableBalance[escrow.token] = (contractorWallet.availableBalance[escrow.token] || 0) + shareAmount;

    escrow.amountDeposited -= shareAmount;
    escrow.milestonesReleased = milestoneId;

    if (escrow.milestonesReleased === escrow.milestones.length) {
      escrow.status = 'completed';
    }

    // Emit events
    this.eventsGateway.emitEvent('escrow.milestone.released', {
      escrowId: id,
      milestoneId,
      amountReleased: shareAmount.toString(),
      txHash: `stellar_tx_rel_${Math.random().toString(36).substr(2, 8)}`,
    });

    this.eventsGateway.emitEvent('wallet.balance.funded', {
      walletId: escrow.contractorWalletId,
      asset: escrow.token,
      amount: shareAmount.toString(),
      newBalance: contractorWallet.availableBalance[escrow.token].toString(),
      reference: `escrow_release_${id}_ms_${milestoneId}`,
    });

    return escrow;
  }

  refundEscrow(id: string, amount: number) {
    const escrow = this.getEscrow(id);
    if (escrow.status !== 'funded') throw new BadRequestException('Escrow is not in active funded state.');
    if (escrow.amountDeposited < amount) throw new BadRequestException('Insufficient deposited balance to refund.');

    const clientWallet = this.getWallet(escrow.clientWalletId);

    // Transfer from client's reserved balance back to client's available balance
    clientWallet.reservedBalance[escrow.token] -= amount;
    clientWallet.availableBalance[escrow.token] += amount;

    escrow.amountDeposited -= amount;
    escrow.status = 'refunded';

    this.eventsGateway.emitEvent('wallet.balance.funded', {
      walletId: escrow.clientWalletId,
      asset: escrow.token,
      amount: amount.toString(),
      newBalance: clientWallet.availableBalance[escrow.token].toString(),
      reference: `escrow_refund_${id}`,
    });

    return escrow;
  }

  getJournalEntries(): JournalEntry[] {
    return this.store.journalEntries;
  }
}
