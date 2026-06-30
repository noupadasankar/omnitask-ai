import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

const makeTransaction = (overrides: Record<string, jest.Mock> = {}) => ({
  subscription: {
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  userQuota: {
    update: jest.fn().mockResolvedValue({}),
  },
  invoice: {
    create: jest.fn().mockResolvedValue({}),
  },
  idempotencyKey: {
    create: jest.fn().mockResolvedValue({}),
  },
  ...overrides,
});

const makePrisma = () => ({
  subscription: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  invoice: {
    findMany: jest.fn(),
  },
  idempotencyKey: {
    findUnique: jest.fn().mockResolvedValue(null), // not seen before by default
    create: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn(),
});

const makeAuditService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const makeStripe = () => ({
  webhooks: {
    constructEvent: jest.fn(),
  },
  customers: { create: jest.fn(), },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
});

// We capture the stripe instance injected by the service via module replacement.
let stripeInstance: ReturnType<typeof makeStripe>;

// ---------------------------------------------------------------------------
// Module setup helper – re-creates the module for every test so mock state
// does not leak between tests.
// ---------------------------------------------------------------------------

async function createModule(stripeKeyPresent = true, webhookSecretPresent = true) {
  stripeInstance = makeStripe();

  // Patch the Stripe constructor so BillingService receives our mock.
  jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => stripeInstance);
  });

  const prisma = makePrisma();
  const audit = makeAuditService();

  const configValues: Record<string, string | undefined> = {
    STRIPE_SECRET_KEY: stripeKeyPresent ? 'sk_test_fake' : undefined,
    STRIPE_WEBHOOK_SECRET: webhookSecretPresent ? 'whsec_fake' : undefined,
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BillingService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuditService, useValue: audit },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => configValues[key]),
        },
      },
    ],
  }).compile();

  return {
    service: module.get<BillingService>(BillingService),
    prisma,
    audit,
  };
}

// ---------------------------------------------------------------------------
// Helpers to build minimal Stripe event shapes
// ---------------------------------------------------------------------------

function makeCheckoutEvent(userId: string, customer = 'cus_123', subscriptionId = 'sub_456'): any {
  return {
    id: 'evt_checkout_001',
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { userId },
        customer,
        subscription: subscriptionId,
      },
    },
  };
}

function makeSubscriptionDeletedEvent(userId: string, customer = 'cus_123'): any {
  return {
    id: 'evt_sub_deleted_001',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        metadata: { userId },
        customer,
      },
    },
  };
}

function makeUnknownEvent(): any {
  return {
    id: 'evt_unknown_001',
    type: 'payment_intent.created',
    data: { object: {} },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BillingService – handleWebhook', () => {
  const rawBody = Buffer.from('{}');
  const validSig = 'v1=valid_sig';

  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  // -------------------------------------------------------------------------
  // 1. checkout.session.completed
  // -------------------------------------------------------------------------

  describe('checkout.session.completed', () => {
    it('upserts the subscription with PRO plan and stripeSubscriptionId', async () => {
      const { service, prisma, audit } = await createModule();
      const event = makeCheckoutEvent('user_abc', 'cus_123', 'sub_456');

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);

      // $transaction should call the callback
      let txCallback: any;
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => {
        txCallback = cb;
        return cb(tx);
      });

      const result = await service.handleWebhook(rawBody, validSig);

      expect(stripeInstance.webhooks.constructEvent).toHaveBeenCalledWith(rawBody, validSig, 'whsec_fake');
      expect(tx.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_abc' },
          create: expect.objectContaining({ plan: 'PRO', stripeSubscriptionId: 'sub_456', stripeCustomerId: 'cus_123' }),
          update: expect.objectContaining({ stripeSubscriptionId: 'sub_456', stripeCustomerId: 'cus_123' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user_abc', action: 'SUBSCRIBED' }),
      );
      expect(result).toEqual({ received: true });
    });

    it('records an idempotency key after processing', async () => {
      const { service, prisma } = await createModule();
      const event = makeCheckoutEvent('user_abc');

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      await service.handleWebhook(rawBody, validSig);

      expect(tx.idempotencyKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: `stripe:${event.id}`,
            route: `stripe-webhook:checkout.session.completed`,
            statusCode: 200,
          }),
        }),
      );
    });

    it('skips processing when the Stripe event was already handled (deduplication)', async () => {
      const { service, prisma } = await createModule();
      const event = makeCheckoutEvent('user_abc');

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      // Simulate event already stored in idempotency table
      (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({ id: `stripe:${event.id}` });

      const result = await service.handleWebhook(rawBody, validSig);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true, deduplicated: true });
    });

    it('does nothing when checkout session has no userId in metadata', async () => {
      const { service, prisma } = await createModule();
      const event: any = {
        id: 'evt_no_user',
        type: 'checkout.session.completed',
        data: { object: { metadata: {}, customer: 'cus_999', subscription: 'sub_999' } },
      };

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      await service.handleWebhook(rawBody, validSig);

      expect(tx.subscription.upsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 2. customer.subscription.deleted
  // -------------------------------------------------------------------------

  describe('customer.subscription.deleted', () => {
    it('sets subscription status to CANCELED and resets plan to FREE', async () => {
      const { service, prisma } = await createModule();
      const event = makeSubscriptionDeletedEvent('user_xyz', 'cus_456');

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      const result = await service.handleWebhook(rawBody, validSig);

      expect(tx.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_xyz' },
          data: { status: 'CANCELED', plan: 'FREE' },
        }),
      );
      expect(result).toEqual({ received: true });
    });

    it('resets userQuota to FREE plan limits', async () => {
      const { service, prisma } = await createModule();
      const event = makeSubscriptionDeletedEvent('user_xyz');

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      await service.handleWebhook(rawBody, validSig);

      expect(tx.userQuota.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_xyz' },
          data: expect.objectContaining({
            tasksPerDay: 10,
            concurrentTasks: 2,
          }),
        }),
      );
    });

    it('falls back to findUserIdByCustomer when metadata has no userId', async () => {
      const { service, prisma } = await createModule();
      const event: any = {
        id: 'evt_sub_del_no_meta',
        type: 'customer.subscription.deleted',
        data: { object: { metadata: {}, customer: 'cus_789' } },
      };

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);

      // subscription lookup for fallback resolution
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ userId: 'user_fallback' });

      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      await service.handleWebhook(rawBody, validSig);

      expect(tx.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user_fallback' } }),
      );
    });

    it('does nothing when userId cannot be resolved (no metadata, no DB match)', async () => {
      const { service, prisma } = await createModule();
      const event: any = {
        id: 'evt_sub_del_unresolvable',
        type: 'customer.subscription.deleted',
        data: { object: { metadata: {}, customer: 'cus_ghost' } },
      };

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);

      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      await service.handleWebhook(rawBody, validSig);

      expect(tx.subscription.update).not.toHaveBeenCalled();
      expect(tx.userQuota.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Invalid signature
  // -------------------------------------------------------------------------

  describe('invalid signature', () => {
    it('throws the error propagated from stripe.webhooks.constructEvent', async () => {
      const { service, prisma } = await createModule();
      const sigError = new Error('No signatures found matching the expected signature for payload');
      stripeInstance.webhooks.constructEvent.mockImplementation(() => { throw sigError; });

      await expect(service.handleWebhook(rawBody, 'bad_sig')).rejects.toThrow(
        'No signatures found matching the expected signature for payload',
      );
      // Transaction must NOT be entered
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not record an idempotency key when signature verification fails', async () => {
      const { service, prisma } = await createModule();
      stripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      await expect(service.handleWebhook(rawBody, 'tampered_sig')).rejects.toThrow();
      expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('throws when STRIPE_WEBHOOK_SECRET env var is missing', async () => {
      // Create module with webhook secret absent
      const { service } = await createModule(true, false);

      await expect(service.handleWebhook(rawBody, validSig)).rejects.toThrow(
        'Webhook secret not configured',
      );
    });

    it('throws when Stripe is not configured (no STRIPE_SECRET_KEY)', async () => {
      const { service } = await createModule(false, true);

      await expect(service.handleWebhook(rawBody, validSig)).rejects.toThrow(
        'Stripe not configured',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Unknown / unhandled event type
  // -------------------------------------------------------------------------

  describe('unknown event type', () => {
    it('returns { received: true } without throwing', async () => {
      const { service, prisma } = await createModule();
      const event = makeUnknownEvent();

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      const result = await service.handleWebhook(rawBody, validSig);

      expect(result).toEqual({ received: true });
    });

    it('does not mutate subscription or userQuota for unhandled event types', async () => {
      const { service, prisma } = await createModule();
      const event = makeUnknownEvent();

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      await service.handleWebhook(rawBody, validSig);

      expect(tx.subscription.upsert).not.toHaveBeenCalled();
      expect(tx.subscription.update).not.toHaveBeenCalled();
      expect(tx.userQuota.update).not.toHaveBeenCalled();
    });

    it('still records an idempotency key for unknown event types', async () => {
      const { service, prisma } = await createModule();
      const event = makeUnknownEvent();

      stripeInstance.webhooks.constructEvent.mockReturnValue(event);
      const tx = makeTransaction();
      (prisma.$transaction as jest.Mock).mockImplementation((cb: any) => cb(tx));

      await service.handleWebhook(rawBody, validSig);

      expect(tx.idempotencyKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: `stripe:${event.id}` }),
        }),
      );
    });
  });
});
