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
} from './entities';

@Injectable()
export class AppService {
  constructor(
    private readonly store: MaringaStore,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Auth Mock
  async login(email: string) {
    const orgId = 'org_chidi';
    const member = await this.store.memberRepo.findOne({ where: { email, organizationId: orgId } });

    if (!member) {
      throw new BadRequestException('User not found in organization.');
    }

    const organization = await this.store.orgRepo.findOne({ where: { id: orgId } });

    return {
      success: true,
      token: 'maringa_jwt_mock_token_' + Math.random().toString(36).substr(2, 9),
      user: member,
      organization,
    };
  }

  // Organizations
  async createOrganization(name: string, taxId: string): Promise<Organization> {
    const orgId = 'org_' + Math.random().toString(36).substr(2, 9);
    const org = this.store.orgRepo.create({
      id: orgId,
      name,
      taxRegistrationNumber: taxId,
      createdAt: new Date(),
    });
    await this.store.orgRepo.save(org);

    // Seed default wallets for the new organization
    await this.createWallet(orgId, 'TREASURY', 'NGN', 'Business Cash Wallet');
    await this.createWallet(orgId, 'TREASURY', 'USDC', 'Stellar Treasury');

    return org;
  }

  async getOrganizationMembers(orgId: string): Promise<Member[]> {
    return this.store.memberRepo.find({ where: { organizationId: orgId } });
  }

  // Wallets
  async createWallet(orgId: string, type: 'TREASURY' | 'SETTLEMENT' | 'ESCROW' | 'TAX', currency: string, name: string): Promise<Wallet> {
    const walletId = 'w_' + Math.random().toString(36).substr(2, 9);
    const wallet = this.store.walletRepo.create({
      id: walletId,
      organizationId: orgId,
      type,
      name,
      stellarAddress: 'G' + Math.random().toString(36).substr(2, 10).toUpperCase() + '...MOCK',
      availableBalance: { [currency]: 0 },
      reservedBalance: { [currency]: 0 },
      createdAt: new Date(),
    });

    // Register corresponding ledger account
    const accCode = `1000-${type}-${currency}-${walletId.toUpperCase()}`;
    const account = this.store.accountRepo.create({
      id: 'acc_' + walletId,
      ledgerId: 'ledger_main',
      code: accCode,
      name: `${name} (${currency})`,
      type: 'ASSET',
      currency,
      createdAt: new Date(),
    });

    await this.store.accountRepo.save(account);
    await this.store.walletRepo.save(wallet);

    return wallet;
  }

  async getWallet(id: string): Promise<Wallet> {
    const wallet = await this.store.walletRepo.findOne({ where: { id } });
    if (!wallet) throw new BadRequestException('Wallet not found.');
    return wallet;
  }

  async getWallets(orgId: string): Promise<Wallet[]> {
    return this.store.walletRepo.find({ where: { organizationId: orgId } });
  }

  async internalTransfer(fromId: string, toId: string, amount: number, currency: string): Promise<JournalEntry> {
    const fromW = await this.getWallet(fromId);
    const toW = await this.getWallet(toId);

    if ((fromW.availableBalance[currency] || 0) < amount) {
      throw new BadRequestException('Insufficient funds in source wallet.');
    }

    // Map to accounts
    const accounts = await this.store.accountRepo.find();
    const fromAcc = accounts.find(
      (a) => a.code.includes(fromId.toUpperCase()) || (fromId === 'w_treasury_main' && a.code.includes('TREASURY-' + currency)),
    );
    const toAcc = accounts.find(
      (a) => a.code.includes(toId.toUpperCase()) || (toId === 'w_treasury_main' && a.code.includes('TREASURY-' + currency)) || (toId === 'w_supplier_882' && a.code.includes('SUPPLIER-' + currency)) || (toId === 'w_agent_comm' && a.code.includes('AGENT-' + currency)) || (toId === 'w_tax_reserve' && a.code.includes('TAX-' + currency)) || (toId === 'w_settlement_main' && a.code.includes('SETTLE-' + currency)),
    );

    if (!fromAcc || !toAcc) {
      throw new BadRequestException('Matching ledger accounts not found.');
    }

    // Post double entry journal entry
    const entry = await this.store.postJournalEntry(
      `Internal Transfer from ${fromW.name} to ${toW.name}`,
      `tx_corr_${Date.now()}`,
      [
        { accountId: fromAcc.id, amount, type: 'CREDIT' as const }, // Credit decreases Asset
        { accountId: toAcc.id, amount, type: 'DEBIT' as const },  // Debit increases Asset
      ],
    );

    // Fetch updated wallet states to get accurate balance
    const updatedFromW = await this.getWallet(fromId);
    const updatedToW = await this.getWallet(toId);

    // Emit balance change events
    this.eventsGateway.emitEvent('wallet.balance.debited', {
      walletId: fromId,
      asset: currency,
      amount: amount.toString(),
      newBalance: updatedFromW.availableBalance[currency].toString(),
      reference: entry.id,
    });

    this.eventsGateway.emitEvent('wallet.balance.funded', {
      walletId: toId,
      asset: currency,
      amount: amount.toString(),
      newBalance: updatedToW.availableBalance[currency].toString(),
      reference: entry.id,
    });

    return entry;
  }

  // Payments & Payment Intents
  async createPaymentIntent(amount: number, currency: string, paymentMethod: string, description: string, metadata: any): Promise<PaymentIntent> {
    const id = 'pi_' + Math.random().toString(36).substr(2, 9);
    const intent = this.store.intentRepo.create({
      id,
      amount,
      currency,
      paymentMethod,
      description,
      status: 'created',
      metadata: metadata || {},
      createdAt: new Date(),
    });

    await this.store.intentRepo.save(intent);
    return intent;
  }

  async getPaymentIntent(id: string): Promise<PaymentIntent> {
    const intent = await this.store.intentRepo.findOne({ where: { id } });
    if (!intent) throw new BadRequestException('Payment intent not found.');
    return intent;
  }

  // Saga: Settle Payment & Run Revenue Split
  async settlePaymentIntent(id: string): Promise<PaymentIntent> {
    const intent = await this.getPaymentIntent(id);
    if (intent.status === 'settled') return intent;

    intent.status = 'settled';

    // 1. Post Ledger Entry: Cash Deposit (Debit Cash, Credit AR)
    const accounts = await this.store.accountRepo.find();
    const treasuryAcc = accounts.find((a) => a.code.includes(`TREASURY-${intent.currency}`));
    const arAcc = accounts.find((a) => a.code.includes(`AR-${intent.currency}`));

    if (treasuryAcc && arAcc) {
      await this.store.postJournalEntry(
        `Payment Settled for ${intent.description}`,
        `pi_settle_${id}`,
        [
          { accountId: arAcc.id, amount: intent.amount, type: 'CREDIT' as const }, // Credit decreases Accounts Receivable
          { accountId: treasuryAcc.id, amount: intent.amount, type: 'DEBIT' as const }, // Debit increases Treasury Cash
        ],
      );
    }

    await this.store.intentRepo.save(intent);

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
      const invoice = await this.store.invoiceRepo.findOne({ where: { id: invoiceId } });
      if (invoice && invoice.status === 'pending') {
        invoice.status = 'paid';
        await this.store.invoiceRepo.save(invoice);
        await this.runRevenueSplit(invoice, intent.currency);
      }
    }

    return intent;
  }

  // Saga Component: Revenue Split
  private async runRevenueSplit(invoice: Invoice, currency: string) {
    const splits = invoice.automationRules.splits;
    const totalAmount = invoice.amount;

    console.log(`Running revenue split saga for Invoice: ${invoice.id}, total: ${totalAmount} ${currency}`);

    const treasuryWalletId = 'w_treasury_main';

    for (const split of splits) {
      const splitAmount = (totalAmount * split.percentage) / 100;
      if (splitAmount <= 0) continue;

      try {
        await this.internalTransfer(treasuryWalletId, split.recipientWalletId, splitAmount, currency);
      } catch (err) {
        console.error(`Saga Step Failed: Split payment to ${split.recipientWalletId} failed:`, err.message);
      }
    }

    if (invoice.automationRules.triggerStellarSettlement && currency === 'USDC') {
      await this.simulateStellarSettlement(invoice);
    }
  }

  // Saga Component: Stellar on-chain distribution simulation
  private async simulateStellarSettlement(invoice: Invoice) {
    console.log(`[Stellar Settlement Saga] Distributing ${invoice.amount} USDC via RevenueSplitter Soroban Contract...`);

    setTimeout(async () => {
      const updatedSettleW = await this.getWallet('w_settlement_main');
      this.eventsGateway.emitEvent('wallet.balance.funded', {
        walletId: 'w_settlement_main',
        asset: 'USDC',
        amount: invoice.amount.toString(),
        newBalance: (updatedSettleW.availableBalance['USDC'] || 0).toString(),
        reference: `stellar_payout_${Math.random().toString(36).substr(2, 9)}`,
      });
      console.log(`[Stellar Settlement Saga] On-chain Soroban splits successfully indexed.`);
    }, 2000);
  }

  // Invoices
  async createInvoice(customerId: string, amount: number, automationRules: any): Promise<Invoice> {
    const id = 'inv_' + Math.random().toString(36).substr(2, 9);
    const invoice = this.store.invoiceRepo.create({
      id,
      customerId,
      amount,
      status: 'pending',
      automationRules: automationRules || { splits: [], triggerStellarSettlement: false },
      createdAt: new Date(),
    });

    await this.store.invoiceRepo.save(invoice);
    return invoice;
  }

  async getInvoices(): Promise<Invoice[]> {
    return this.store.invoiceRepo.find();
  }

  // Escrow Service
  async createEscrow(
    amount: number,
    asset: string,
    contractorWalletId: string,
    milestones: any[],
  ): Promise<Escrow> {
    const id = 'esc_' + Math.random().toString(36).substr(2, 9);
    const escrow = this.store.escrowRepo.create({
      id,
      clientAddress: 'w_treasury_main',
      contractorAddress: contractorWalletId,
      arbiterAddress: 'w_agent_comm', // Use agent wallet as arbiter mock
      tokenAddress: asset,
      totalAmount: amount,
      milestones: milestones || [],
      milestonesReleased: 0,
      amountDeposited: 0,
      amountReleased: 0,
      status: 'created',
      createdAt: new Date(),
    });

    await this.store.escrowRepo.save(escrow);

    this.eventsGateway.emitEvent('escrow.contract.created', {
      escrowId: id,
      sorobanContractAddress: id, // In simulated mode escrow contract address is just the escrow ID
      clientWalletId: escrow.clientAddress,
      contractorWalletId: escrow.contractorAddress,
      totalAmount: amount.toString(),
      asset,
      milestonesCount: escrow.milestones.length,
    });

    return escrow;
  }

  async getEscrow(id: string): Promise<Escrow> {
    const escrow = await this.store.escrowRepo.findOne({ where: { id } });
    if (!escrow) throw new BadRequestException('Escrow not found.');
    return escrow;
  }

  async getEscrows(): Promise<Escrow[]> {
    return this.store.escrowRepo.find();
  }

  async fundEscrow(id: string, amount: number): Promise<Escrow> {
    const escrow = await this.getEscrow(id);
    if (escrow.status !== 'created') throw new BadRequestException('Escrow already funded or completed.');

    const clientWallet = await this.getWallet(escrow.clientAddress);
    if ((clientWallet.availableBalance[escrow.tokenAddress] || 0) < amount) {
      throw new BadRequestException('Insufficient client funds to lock in escrow.');
    }

    // Reserve funds in the client wallet
    clientWallet.availableBalance[escrow.tokenAddress] -= amount;
    clientWallet.reservedBalance[escrow.tokenAddress] = (clientWallet.reservedBalance[escrow.tokenAddress] || 0) + amount;
    clientWallet.availableBalance = { ...clientWallet.availableBalance }; // Trigger change detection
    clientWallet.reservedBalance = { ...clientWallet.reservedBalance };

    await this.store.walletRepo.save(clientWallet);

    escrow.amountDeposited += amount;
    if (escrow.amountDeposited >= escrow.totalAmount) {
      escrow.status = 'funded';
    }

    await this.store.escrowRepo.save(escrow);

    // Emit event
    this.eventsGateway.emitEvent('wallet.balance.debited', {
      walletId: escrow.clientAddress,
      asset: escrow.tokenAddress,
      amount: amount.toString(),
      newBalance: clientWallet.availableBalance[escrow.tokenAddress].toString(),
      reference: `escrow_fund_${id}`,
    });

    return escrow;
  }

  async releaseEscrowMilestone(id: string, milestoneId: number): Promise<Escrow> {
    const escrow = await this.getEscrow(id);
    if (escrow.status !== 'funded') throw new BadRequestException('Escrow is not funded.');

    if (milestoneId !== escrow.milestonesReleased + 1) {
      throw new BadRequestException('Milestones must be released sequentially.');
    }

    const milestone = escrow.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new BadRequestException('Milestone not found.');

    const clientWallet = await this.getWallet(escrow.clientAddress);
    const contractorWallet = await this.getWallet(escrow.contractorAddress);

    // Calculate share amount
    const shareAmount = (escrow.totalAmount * milestone.percentage) / 100;

    if (escrow.amountDeposited < shareAmount) {
      throw new BadRequestException('Insufficient deposited escrow balance.');
    }

    // Transfer from client's reserved balance to contractor's available balance
    clientWallet.reservedBalance[escrow.tokenAddress] -= shareAmount;
    contractorWallet.availableBalance[escrow.tokenAddress] = (contractorWallet.availableBalance[escrow.tokenAddress] || 0) + shareAmount;

    clientWallet.reservedBalance = { ...clientWallet.reservedBalance };
    contractorWallet.availableBalance = { ...contractorWallet.availableBalance };

    await this.store.walletRepo.save(clientWallet);
    await this.store.walletRepo.save(contractorWallet);

    escrow.amountDeposited -= shareAmount;
    escrow.amountReleased += shareAmount;
    escrow.milestonesReleased = milestoneId;

    if (escrow.milestonesReleased === escrow.milestones.length) {
      escrow.status = 'completed';
    }

    await this.store.escrowRepo.save(escrow);

    // Emit events
    this.eventsGateway.emitEvent('escrow.milestone.released', {
      escrowId: id,
      milestoneId,
      amountReleased: shareAmount.toString(),
      txHash: `stellar_tx_rel_${Math.random().toString(36).substr(2, 8)}`,
    });

    this.eventsGateway.emitEvent('wallet.balance.funded', {
      walletId: escrow.contractorAddress,
      asset: escrow.tokenAddress,
      amount: shareAmount.toString(),
      newBalance: contractorWallet.availableBalance[escrow.tokenAddress].toString(),
      reference: `escrow_release_${id}_ms_${milestoneId}`,
    });

    return escrow;
  }

  async refundEscrow(id: string, amount: number): Promise<Escrow> {
    const escrow = await this.getEscrow(id);
    if (escrow.status !== 'funded') throw new BadRequestException('Escrow is not in active funded state.');
    if (escrow.amountDeposited < amount) throw new BadRequestException('Insufficient deposited balance to refund.');

    const clientWallet = await this.getWallet(escrow.clientAddress);

    // Transfer from client's reserved balance back to client's available balance
    clientWallet.reservedBalance[escrow.tokenAddress] -= amount;
    clientWallet.availableBalance[escrow.tokenAddress] += amount;

    clientWallet.reservedBalance = { ...clientWallet.reservedBalance };
    clientWallet.availableBalance = { ...clientWallet.availableBalance };

    await this.store.walletRepo.save(clientWallet);

    escrow.amountDeposited -= amount;
    escrow.status = 'refunded';

    await this.store.escrowRepo.save(escrow);

    this.eventsGateway.emitEvent('wallet.balance.funded', {
      walletId: escrow.clientAddress,
      asset: escrow.tokenAddress,
      amount: amount.toString(),
      newBalance: clientWallet.availableBalance[escrow.tokenAddress].toString(),
      reference: `escrow_refund_${id}`,
    });

    return escrow;
  }

  async getJournalEntries(): Promise<JournalEntry[]> {
    return this.store.journalEntryRepo.find({
      relations: { lines: true },
      order: { createdAt: 'DESC' },
    });
  }
}
