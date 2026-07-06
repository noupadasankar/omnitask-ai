import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import Stripe from 'stripe';

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  PRO: { monthly: 2900, yearly: 29000 },
  TEAM: { monthly: 9900, yearly: 99000 },
  ENTERPRISE: { monthly: 0, yearly: 0 },
};

const PLAN_LIMITS: Record<string, { tasksPerDay: number; concurrentTasks: number; storageBytes: bigint }> = {
  FREE: { tasksPerDay: 10, concurrentTasks: 2, storageBytes: BigInt(512 * 1024 * 1024) },
  PRO: { tasksPerDay: 50, concurrentTasks: 5, storageBytes: BigInt(5 * 1024 * 1024 * 1024) },
  TEAM: { tasksPerDay: 200, concurrentTasks: 20, storageBytes: BigInt(50 * 1024 * 1024 * 1024) },
  ENTERPRISE: { tasksPerDay: 1000, concurrentTasks: 100, storageBytes: BigInt(500 * 1024 * 1024 * 1024) },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe?: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key, { apiVersion: '2025-03-31.basil' as any });
    }
  }

  getPlans() {
    return Object.entries(PLAN_PRICES).map(([plan, prices]) => ({
      id: plan.toLowerCase(),
      name: plan,
      monthlyPrice: prices.monthly,
      yearlyPrice: prices.yearly,
      ...PLAN_LIMITS[plan],
    }));
  }

  async createCheckoutSession(userId: string, priceId: string, successUrl: string, cancelUrl: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const [subscription, user] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user?.email,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
    });

    // Persist Stripe customer ID atomically
    await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, stripeCustomerId: customerId, plan: 'FREE' },
      update: { stripeCustomerId: customerId },
    });

    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(userId: string, returnUrl: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!subscription?.stripeCustomerId) throw new Error('No customer found');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) throw new Error('Webhook secret not configured');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw err;
    }

    // Idempotency: skip already-processed Stripe event IDs
    const eventId = event.id;
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { id: `stripe:${eventId}` },
    });
    if (existing) {
      this.logger.log(`Skipping already-processed Stripe event: ${eventId}`);
      return { received: true, deduplicated: true };
    }

    await this.prisma.$transaction(async (tx) => {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          if (userId) {
            const customerId = session.customer as string;
            const subscriptionId = session.subscription as string;

            await tx.subscription.upsert({
              where: { userId },
              create: { userId, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, plan: 'PRO' },
              update: { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId },
            });

            await this.auditService.log({
              userId, action: 'SUBSCRIBED', resource: 'subscription',
              metadata: { plan: 'PRO', subscriptionId },
            });
          }
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          const uid = invoice.metadata?.userId || (await this.findUserIdByCustomer(invoice.customer as string));
          if (uid && invoice.id) {
            await tx.invoice.create({
              data: {
                userId: uid,
                stripeInvoiceId: invoice.id,
                amount: invoice.amount_paid,
                currency: invoice.currency,
                status: 'paid',
                paidAt: new Date(invoice.status_transitions?.paid_at || Date.now()),
                periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : undefined,
                periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
                invoicePdf: invoice.invoice_pdf,
              },
            });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subData = event.data.object as Record<string, any>;
          const uid2 = subData.metadata?.userId || (await this.findUserIdByCustomer(subData.customer as string));
          if (uid2) {
            await tx.subscription.update({
              where: { userId: uid2 },
              data: {
                status: subData.status as any,
                currentPeriodStart: subData.current_period_start ? new Date(subData.current_period_start * 1000) : undefined,
                currentPeriodEnd: subData.current_period_end ? new Date(subData.current_period_end * 1000) : undefined,
                cancelAtPeriodEnd: subData.cancel_at_period_end ?? false,
              },
            });
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const deletedSub = event.data.object as Stripe.Subscription;
          const uid3 = deletedSub.metadata?.userId || (await this.findUserIdByCustomer(deletedSub.customer as string));
          if (uid3) {
            await tx.subscription.update({
              where: { userId: uid3 },
              data: { status: 'CANCELED', plan: 'FREE' },
            });
            await tx.userQuota.update({
              where: { userId: uid3 },
              data: PLAN_LIMITS.FREE,
            });
          }
          break;
        }
      }

      // Record idempotency key so we never process the same Stripe event twice
      await tx.idempotencyKey.create({
        data: {
          id: `stripe:${eventId}`,
          userId: 'system',
          route: `stripe-webhook:${event.type}`,
          statusCode: 200,
          response: { received: true },
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    });

    return { received: true };
  }

  async getSubscription(userId: string) {
    return this.prisma.subscription.findUnique({ where: { userId } });
  }

  async getInvoices(userId: string, skip = 0, take = 50) {
    return this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  private async findUserIdByCustomer(customerId: string): Promise<string | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId },
    });
    return sub?.userId ?? null;
  }
}
