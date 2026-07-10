import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  ConflictException,
  Query,
} from '@nestjs/common';
import { AppService } from './app.service';
import { MaringaStore } from './store';

@Controller('v1')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly store: MaringaStore,
  ) {}

  // Idempotency check helper
  private async checkIdempotency(key: string) {
    if (!key) return null;
    const existing = await this.store.idempotencyRepo.findOne({
      where: { key },
    });
    if (existing) {
      if (existing.status === 'PROCESSING') {
        throw new ConflictException('Request already in progress.');
      }
      return existing.response;
    }
    const newKey = this.store.idempotencyRepo.create({
      key,
      status: 'PROCESSING',
      response: null,
    });
    await this.store.idempotencyRepo.save(newKey);
    return null;
  }

  private async saveIdempotencyResponse(key: string, response: any) {
    if (!key) return;
    await this.store.idempotencyRepo.update(key, {
      status: 'COMPLETED',
      response,
    });
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
    const cached = await this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = await this.appService.createOrganization(body.name, body.taxId);
    await this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  @Get('organizations/:id/members')
  async getMembers(@Param('id') id: string) {
    return this.appService.getOrganizationMembers(id);
  }

  // Wallets
  @Post('wallets')
  async createWallet(
    @Body()
    body: {
      type: 'TREASURY' | 'SETTLEMENT' | 'ESCROW' | 'TAX';
      currency: string;
      name: string;
    },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = await this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const orgId = 'org_chidi'; // Mock default org
    const res = await this.appService.createWallet(
      orgId,
      body.type,
      body.currency,
      body.name,
    );
    await this.saveIdempotencyResponse(idempotencyKey, res);
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
    @Body()
    body: {
      fromWalletId: string;
      toWalletId: string;
      amount: number;
      currency: string;
    },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = await this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = await this.appService.internalTransfer(
      body.fromWalletId,
      body.toWalletId,
      body.amount,
      body.currency,
    );
    await this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  // Payments & Payment Intents
  @Post('payments/intents')
  async createPaymentIntent(
    @Body()
    body: {
      amount: number;
      currency: string;
      paymentMethod: string;
      description: string;
      metadata: any;
    },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = await this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = await this.appService.createPaymentIntent(
      body.amount,
      body.currency,
      body.paymentMethod,
      body.description,
      body.metadata,
    );
    await this.saveIdempotencyResponse(idempotencyKey, res);
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
    const cached = await this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = await this.appService.createInvoice(
      body.customerId,
      body.amount,
      body.automationRules,
    );
    await this.saveIdempotencyResponse(idempotencyKey, res);
    return res;
  }

  @Get('invoices')
  async getInvoices() {
    return this.appService.getInvoices();
  }

  // Escrows
  @Post('escrows')
  async createEscrow(
    @Body()
    body: {
      amount: number;
      asset: string;
      contractorWalletId: string;
      milestones: any[];
    },
    @Headers('X-Idempotency-Key') idempotencyKey: string,
  ) {
    const cached = await this.checkIdempotency(idempotencyKey);
    if (cached) return cached;

    const res = await this.appService.createEscrow(
      body.amount,
      body.asset,
      body.contractorWalletId,
      body.milestones,
    );
    await this.saveIdempotencyResponse(idempotencyKey, res);
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
  async releaseEscrowMilestone(
    @Param('id') id: string,
    @Body() body: { milestoneId: number },
  ) {
    return this.appService.releaseEscrowMilestone(id, body.milestoneId);
  }

  @Post('escrows/:id/refund')
  async refundEscrow(
    @Param('id') id: string,
    @Body() body: { amount: number },
  ) {
    return this.appService.refundEscrow(id, body.amount);
  }

  // Double-Entry Ledger Inspector
  @Get('ledger/journal-entries')
  async getJournalEntries() {
    return this.appService.getJournalEntries();
  }
}
