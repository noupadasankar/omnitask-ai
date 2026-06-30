import { Controller, Get, Post, Body, Req, Headers, Query, UseGuards, RawBodyRequest, Req as RequestDecorator } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @Post('create-checkout-session')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(
    @Req() req: AuthRequest,
    @Body() body: { priceId: string; successUrl: string; cancelUrl: string },
  ) {
    return this.billingService.createCheckoutSession(
      req.user.id, body.priceId, body.successUrl, body.cancelUrl,
    );
  }

  @Post('create-portal-session')
  @UseGuards(JwtAuthGuard)
  async createPortalSession(
    @Req() req: AuthRequest,
    @Body('returnUrl') returnUrl: string,
  ) {
    return this.billingService.createPortalSession(req.user.id, returnUrl);
  }

  @Post('webhook')
  async handleWebhook(
    @RequestDecorator() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody!, signature);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  async getSubscription(@Req() req: AuthRequest) {
    return this.billingService.getSubscription(req.user.id);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  async getInvoices(
    @Req() req: AuthRequest,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.billingService.getInvoices(
      req.user.id,
      skip ? parseInt(skip) : 0,
      take ? parseInt(take) : 50,
    );
  }
}
