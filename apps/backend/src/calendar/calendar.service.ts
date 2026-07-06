import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { google } from 'googleapis';
import { ConfidentialClientApplication } from '@azure/msal-node';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async connect(userId: string, provider: 'google' | 'outlook', code: string, redirectUri: string) {
    if (provider === 'google') return this.connectGoogle(userId, code, redirectUri);
    return this.connectOutlook(userId, code, redirectUri);
  }

  async disconnect(userId: string, accountId: string) {
    const acct = await this.prisma.calendarAccount.findFirst({ where: { id: accountId, userId } });
    if (!acct) return null;
    await this.prisma.calendarAccount.update({ where: { id: accountId }, data: { deletedAt: new Date() } });
    await this.prisma.calendarEvent.updateMany({ where: { accountId }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  async listAccounts(userId: string) {
    return this.prisma.calendarAccount.findMany({ where: { userId, deletedAt: null } });
  }

  async createEvent(userId: string, dto: {
    accountId?: string; title: string; description?: string; location?: string;
    startTime: string; endTime: string; isAllDay?: boolean; timezone?: string;
    attendees?: { email: string; name?: string }[]; travelBufferMin?: number;
  }) {
    const account = dto.accountId
      ? await this.prisma.calendarAccount.findFirst({ where: { id: dto.accountId, userId, deletedAt: null } })
      : await this.prisma.calendarAccount.findFirst({ where: { userId, deletedAt: null, isPrimary: true } });

    if (!account) throw new Error('No calendar account connected');

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    const event = await this.prisma.calendarEvent.create({
      data: {
        accountId: account.id,
        userId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startTime,
        endTime,
        isAllDay: dto.isAllDay ?? false,
        timezone: dto.timezone || account.timezone,
        attendees: dto.attendees || [],
        travelBufferMin: dto.travelBufferMin,
        source: account.provider,
      },
    });

    if (account.provider === 'google') {
      await this.syncToGoogle(account, event).catch((err) =>
        this.logger.warn(`Failed to sync event to Google: ${err.message}`));
    }
    return event;
  }

  async listEvents(userId: string, accountId?: string, from?: string, to?: string) {
    const where: any = { userId, deletedAt: null };
    if (accountId) where.accountId = accountId;
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = new Date(from);
      if (to) where.startTime.lte = new Date(to);
    }
    return this.prisma.calendarEvent.findMany({ where, orderBy: { startTime: 'asc' } });
  }

  async updateEvent(userId: string, eventId: string, dto: Record<string, unknown>) {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, userId } });
    if (!event) return null;
    return this.prisma.calendarEvent.update({ where: { id: eventId }, data: dto as any });
  }

  async deleteEvent(userId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, userId } });
    if (!event) return null;
    return this.prisma.calendarEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
  }

  async findAvailableSlots(userId: string, dto: {
    durationMin: number; startBuffer: string; endBuffer: string; timezone?: string;
    preferredDays?: number[]; preferredStartHour?: number; preferredEndHour?: number;
    minTravelBuffer?: number;
  }) {
    const start = new Date(dto.startBuffer);
    const end = new Date(dto.endBuffer);
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        startTime: { gte: start, lte: end },
      },
      orderBy: { startTime: 'asc' },
    });

    const prefDays = dto.preferredDays ?? [1, 2, 3, 4, 5];
    const prefStartHour = dto.preferredStartHour ?? 9;
    const prefEndHour = dto.preferredEndHour ?? 17;
    const buffer = dto.minTravelBuffer ?? 15;

    const slots: { start: string; end: string; score: number }[] = [];
    let cursor = new Date(start);
    while (cursor < end) {
      const day = cursor.getUTCDay();
      if (!prefDays.includes(day)) { cursor = this.addDays(cursor, 1); continue; }

      const dayStart = new Date(cursor);
      dayStart.setUTCHours(prefStartHour, 0, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setUTCHours(prefEndHour, 0, 0, 0);

      let slotStart = new Date(Math.max(dayStart.getTime(), cursor.getTime()));

      while (slotStart.getTime() + dto.durationMin * 60000 <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + dto.durationMin * 60000);

        const conflict = events.some((e) => {
          const eStart = e.startTime.getTime() - buffer * 60000;
          const eEnd = e.endTime.getTime() + buffer * 60000;
          return slotStart.getTime() < eEnd && slotEnd.getTime() > eStart;
        });

        if (!conflict) {
          const hour = slotStart.getUTCHours();
          const score = hour >= 10 && hour <= 15 ? 1 : 0.7;
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), score });
        }
        slotStart = new Date(slotStart.getTime() + 30 * 60000);
      }
      cursor = this.addDays(cursor, 1);
    }

    return slots.sort((a, b) => b.score - a.score);
  }

  private async connectGoogle(userId: string, code: string, redirectUri: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('Google Calendar OAuth not configured');

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { data: calList } = await calendar.calendarList.list();

    const primary = calList.items?.find((c) => c.primary) || calList.items?.[0];
    return this.prisma.calendarAccount.create({
      data: {
        userId,
        provider: 'google',
        email: primary?.id || 'unknown',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarName: primary?.summary || 'Primary',
        isPrimary: true,
      },
    });
  }

  private async connectOutlook(userId: string, code: string, redirectUri: string) {
    const clientId = this.config.get<string>('OUTLOOK_CLIENT_ID');
    const clientSecret = this.config.get<string>('OUTLOOK_CLIENT_SECRET');
    if (!clientId) throw new Error('Outlook Calendar OAuth not configured');

    const msal = new ConfidentialClientApplication({
      auth: { clientId, clientSecret: clientSecret || '' },
    });
    const result = await msal.acquireTokenByCode({ code, scopes: ['Calendars.ReadWrite', 'User.Read'], redirectUri });

    const email = result.account?.username || 'outlook-user';
    return this.prisma.calendarAccount.create({
      data: {
        userId,
        provider: 'outlook',
        email,
        accessToken: result.accessToken,
        refreshToken: (result as any).refreshToken || null,
        isPrimary: true,
      },
    });
  }

  private async syncToGoogle(account: any, event: any) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: account.accessToken, refresh_token: account.refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { data } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description: event.description || undefined,
        location: event.location || undefined,
        start: { dateTime: event.startTime.toISOString(), timeZone: event.timezone },
        end: { dateTime: event.endTime.toISOString(), timeZone: event.timezone },
        attendees: event.attendees?.length ? event.attendees : undefined,
      },
    });
    await this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: { externalId: data.id },
    });
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }
}
