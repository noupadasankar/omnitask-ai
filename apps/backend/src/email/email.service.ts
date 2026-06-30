import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../vault/vault.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import nodemailer from 'nodemailer';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL_MINI } from '../common/llm-config';

export interface EmailConfig {
  provider: 'gmail' | 'outlook' | 'imap';
  email: string;
  accessToken?: string;
  refreshToken?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  useTls?: boolean;
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private prisma: PrismaService,
    private vault: VaultService,
    private llm: LlmService,
    private eventEmitter: EventEmitter2,
  ) {}

  async addAccount(userId: string, config: EmailConfig) {
    const vaultKey = `email_${config.provider}_${config.email}`;
    await this.vault.storeCredential(userId, vaultKey, config.email, { accessToken: config.accessToken || '', refreshToken: config.refreshToken || '' });

    const existing = await this.prisma.emailAccount.findFirst({
      where: { userId, email: config.email },
    });
    if (existing) {
      return this.prisma.emailAccount.update({
        where: { id: existing.id },
        data: { accessToken: config.accessToken, refreshToken: config.refreshToken, isActive: true },
      });
    }
    return this.prisma.emailAccount.create({
      data: {
        userId,
        provider: config.provider,
        email: config.email,
        accessToken: config.accessToken,
        refreshToken: config.refreshToken,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        useTls: config.useTls,
        isActive: true,
      },
    });
  }

  async removeAccount(userId: string, accountId: string) {
    const acct = await this.prisma.emailAccount.findFirst({ where: { id: accountId, userId } });
    if (!acct) return null;
    const vaultKey = `email_${acct.provider}_${acct.email}`;
    await this.vault.deleteCredential(userId, vaultKey).catch(() => {});
    return this.prisma.emailAccount.update({ where: { id: accountId }, data: { deletedAt: new Date(), isActive: false } });
  }

  async listAccounts(userId: string) {
    return this.prisma.emailAccount.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, provider: true, email: true, isActive: true, lastSyncedAt: true },
    });
  }

  async sendEmail(userId: string, accountId: string, input: SendEmailInput) {
    const account = await this.prisma.emailAccount.findFirst({ where: { id: accountId, userId, deletedAt: null } });
    if (!account) throw new Error('Email account not found');

    const vaultKey = `email_${account.provider}_${account.email}`;
    const creds = await this.vault.getCredential(userId, vaultKey).catch(() => null);

    if (account.provider === 'gmail' && creds?.accessToken) {
      await this.sendViaGmail(account, creds.accessToken, input);
    } else if (account.provider === 'outlook' && creds?.accessToken) {
      await this.sendViaOutlook(account, creds.accessToken, input);
    } else {
      await this.sendViaSmtp(account, input);
    }

    const message = await this.prisma.emailMessage.create({
      data: {
        accountId: account.id,
        userId,
        messageId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        from: account.email,
        to: input.to,
        cc: input.cc || [],
        bcc: input.bcc || [],
        subject: input.subject,
        bodyText: input.body,
        bodyHtml: input.bodyHtml || null,
        labels: ['SENT'],
        isRead: true,
        receivedAt: new Date(),
      },
    });

    this.eventEmitter.emit('email.sent', { userId, accountId, messageId: message.id });
    return message;
  }

  async sendScheduled(userId: string, accountId: string, input: SendEmailInput, scheduledAt: Date) {
    const existing = await this.prisma.scheduledEmail.findFirst({
      where: { userId, status: 'pending', scheduledAt },
    });
    if (existing) return existing;

    return this.prisma.scheduledEmail.create({
      data: { userId, accountId, to: input.to, cc: input.cc || [], bcc: input.bcc || [], subject: input.subject, body: input.body, bodyHtml: input.bodyHtml, scheduledAt, status: 'pending' },
    });
  }

  async categorizeEmail(emailId: string) {
    const email = await this.prisma.emailMessage.findUnique({ where: { id: emailId } });
    if (!email) throw new Error('Email not found');

    const prompt = `Categorize this email subject into one of: primary, social, promotions, updates, forums.\nSubject: ${email.subject}\nBody: ${(email.bodyText || '').slice(0, 500)}\nCategory:`;
    try {
      const res = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL_MINI,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
      });
      const category = res.choices[0]?.message?.content?.trim().toLowerCase() || 'updates';
      await this.prisma.emailMessage.update({ where: { id: emailId }, data: { labels: [...(email.labels || []), category] } });
      return category;
    } catch {
      return 'updates';
    }
  }

  async draftReply(emailId: string, tone: 'professional' | 'casual' | 'brief' = 'professional') {
    const email = await this.prisma.emailMessage.findUnique({ where: { id: emailId } });
    if (!email) throw new Error('Email not found');

    const prompt = `Write a ${tone} reply email to the following message.\n\nFrom: ${email.from}\nSubject: ${email.subject}\nBody: ${(email.bodyText || '').slice(0, 1000)}\n\nReply:`;
    try {
      const res = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL_MINI,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      });
      return { draft: res.choices[0]?.message?.content?.trim() || '' };
    } catch {
      return { draft: `Thank you for your message regarding "${email.subject}". I will get back to you shortly.` };
    }
  }

  async unsubscribe(emailId: string) {
    const email = await this.prisma.emailMessage.findUnique({ where: { id: emailId } });
    if (!email) throw new Error('Email not found');

    const body = email.bodyText || '';
    const links = this.extractLinks(body);
    const unsubLink = links.find((l) => l.toLowerCase().includes('unsub'));
    if (unsubLink) {
      await fetch(unsubLink, { method: 'GET' }).catch(() => {});
    }
    await this.prisma.emailMessage.update({ where: { id: emailId }, data: { labels: [...(email.labels || []), 'unsubscribed'] } });
    return { unsubscribed: true, linkUsed: unsubLink || null };
  }

  async listMessages(userId: string, accountId: string, folder?: string, search?: string, cursor?: string, take: number = 20) {
    const pageSize = Math.min(take, 50);
    const where: any = { accountId, userId, deletedAt: null };
    if (folder) where.labels = { has: folder };
    if (search) where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { bodyText: { contains: search, mode: 'insensitive' } },
    ];

    const decodedCursor = cursor ? (() => { try { return Buffer.from(cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })() : undefined;
    const items = await this.prisma.emailMessage.findMany({
      take: pageSize + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      where,
      orderBy: { receivedAt: 'desc' },
      select: { id: true, from: true, to: true, subject: true, bodyText: true, isRead: true, labels: true, receivedAt: true },
    });

    const hasMore = items.length > pageSize;
    const data = hasMore ? items.slice(0, pageSize) : items;
    const last = data[data.length - 1];
    return { data, nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null, hasMore };
  }

  async composeDraft(userId: string, accountId: string, to: string[], subject: string, body: string) {
    return this.prisma.emailMessage.create({
      data: { accountId, userId, messageId: `draft-${Date.now()}`, from: '', to, subject, bodyText: body, labels: ['DRAFT'], isRead: true, receivedAt: new Date() },
    });
  }

  async markAsRead(userId: string, messageId: string) {
    return this.prisma.emailMessage.updateMany({ where: { id: messageId, userId }, data: { isRead: true } });
  }

  async deleteMessage(userId: string, messageId: string) {
    return this.prisma.emailMessage.updateMany({ where: { id: messageId, userId }, data: { deletedAt: new Date() } });
  }

  async predictOptimalSendTime(userId: string): Promise<{ recommendedHour: number; confidence: number }> {
    const recentSent = await this.prisma.emailMessage.findMany({
      where: { userId, labels: { has: 'SENT' }, receivedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
    if (recentSent.length < 5) return { recommendedHour: 10, confidence: 0.5 };

    const openCount = recentSent.filter((m) => m.isRead).length;
    const openRate = openCount / recentSent.length;
    return { recommendedHour: 10, confidence: Math.min(openRate, 0.85) };
  }

  private async sendViaGmail(account: any, accessToken: string, input: SendEmailInput) {
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { type: 'OAuth2', user: account.email, accessToken },
    });
    await transport.sendMail({
      from: account.email, to: input.to.join(','), cc: input.cc?.join(','), bcc: input.bcc?.join(','),
      subject: input.subject, text: input.body, html: input.bodyHtml,
    });
    this.logger.log(`Email sent via Gmail: ${input.subject}`);
  }

  private async sendViaOutlook(account: any, accessToken: string, input: SendEmailInput) {
    const transport = nodemailer.createTransport({
      host: 'smtp.office365.com', port: 587, secure: false,
      auth: { type: 'OAuth2', user: account.email, accessToken },
    });
    await transport.sendMail({
      from: account.email, to: input.to.join(','), cc: input.cc?.join(','), bcc: input.bcc?.join(','),
      subject: input.subject, text: input.body, html: input.bodyHtml,
    });
    this.logger.log(`Email sent via Outlook: ${input.subject}`);
  }

  private async sendViaSmtp(account: any, input: SendEmailInput) {
    const transport = nodemailer.createTransport({
      host: account.smtpHost || 'smtp.gmail.com',
      port: account.smtpPort || 587,
      secure: account.useTls ?? true,
      auth: account.accessToken ? { user: account.email, pass: account.accessToken } : undefined,
    });
    await transport.sendMail({
      from: account.email, to: input.to.join(','), cc: input.cc?.join(','), bcc: input.bcc?.join(','),
      subject: input.subject, text: input.body, html: input.bodyHtml,
    });
    this.logger.log(`Email sent via SMTP: ${input.subject}`);
  }

  private extractLinks(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"]+/g;
    return text.match(urlRegex) || [];
  }
}
