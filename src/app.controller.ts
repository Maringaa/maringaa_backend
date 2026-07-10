import { Controller, Get, Post, Body, Param, Headers, ConflictException, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { MaringaStore } from './store';

@Controller('v1')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly store: MaringaStore,
  ) {}

  // Idempotency check helper
  private checkIdempotency(key: string) {
    if (!key) return null;
    const existing = this.store.idempotencyKeys.get(key);
    if (existing) {
      if (existing.status === 'PROCESSING') {
        throw new ConflictException('Request already in progress.');
      }
      return existing.response;
    }
    this.store.idempotencyKeys.set(key, { status: 'PROCESSING', response: null });
    return null;
  }

  private saveIdempotencyResponse(key: string, response: any) {
    if (!key) return;
    this.store.idempotencyKeys.set(key, { status: 'COMPLETED', response });
  }

  // Authentication
  @Post('auth/login')
  async login(@Body() body: { email: string }) {
    return this.appService.login(body.email);
  }

  // Organizations
  @Post('organizations')
  async createOrganization(
    @Body() body: { name: string; taxId: string },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = this.appService.createOrganization(body.name, body.taxId);
    this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  @Get('organizations/:id/members')
  async getMembers(@Param('id') id: string) {
    return this.appService.getOrganizationMembers(id);
  }

  // Wallets
  @Post('wallets')
  async createWallet(
    @Body() body: { type: 'TREASURY' | 'SETTLEMENT' | 'ESCROW' | 'TAX'; currency: string; name: string },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const orgId = 'org_chidi'; // Mock default org
    const res = this.appService.createWallet(orgId, body.type, body.currency, body.name);
    this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  @Get('wallets')
  async getWallets(@Query('orgId') orgId: string) {
    return this.appService.getWallets(orgId || 'org_chidi');
  }

  @Get('wallets/:id')
  async getWallet(@Param('id') id: string) {
    return this.appService.getWallet(id);
  }

  @Post('wallets/transfer')
  async transfer(
    @Body() body: { fromWalletId: string; toWalletId: string; amount: number; currency: string },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = this.appService.internalTransfer(body.fromWalletId, body.toWalletId, body.amount, body.currency);
    this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  // Payments & Payment Intents
  @Post('payments/intents')
  async createPaymentIntent(
    @Body() body: { amount: number; currency: string; paymentMethod: string; description: string; metadata: any },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = this.appService.createPaymentIntent(body.amount, body.currency, body.paymentMethod, body.description, body.metadata);
    this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  @Get('payments/intents/:id')
  async getPaymentIntent(@Param('id') id: string) {
    return this.appService.getPaymentIntent(id);
  }

  @Post('payments/intents/:id/settle')
  async settlePaymentIntent(@Param('id') id: string) {
    return this.appService.settlePaymentIntent(id);
  }

  // Invoices
  @Post('invoices')
  async createInvoice(
    @Body() body: { customerId: string; amount: number; automationRules: any },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = this.appService.createInvoice(body.customerId, body.amount, body.automationRules);
    this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  @Get('invoices')
  async getInvoices() {
    return this.appService.getInvoices();
  }

  // Escrows
  @Post('escrows')
  async createEscrow(
    @Body() body: { amount: number; asset: string; contractorWalletId: string; milestones: any[] },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = this.appService.createEscrow(body.amount, body.asset, body.contractorWalletId, body.milestones);
    this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  @Get('escrows')
  async getEscrows() {
    return this.appService.getEscrows();
  }

  @Get('escrows/:id')
  async getEscrow(@Param('id') id: string) {
    return this.appService.getEscrow(id);
  }

  @Post('escrows/:id/fund')
  async fundEscrow(@Param('id') id: string, @Body() body: { amount: number }) {
    return this.appService.fundEscrow(id, body.amount);
  }

  @Post('escrows/:id/release')
  async releaseEscrowMilestone(@Param('id') id: string, @Body() body: { milestoneId: number }) {
    return this.appService.releaseEscrowMilestone(id, body.milestoneId);
  }

  @Post('escrows/:id/refund')
  async refundEscrow(@Param('id') id: string, @Body() body: { amount: number }) {
    return this.appService.refundEscrow(id, body.amount);
  }

  // Double-Entry Ledger Inspector
  @Get('ledger/journal-entries')
  async getJournalEntries() {
    return this.appService.getJournalEntries();
  }
}
