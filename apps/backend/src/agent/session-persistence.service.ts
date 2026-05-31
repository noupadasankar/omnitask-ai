import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserProvider } from './providers/browser-provider.interface';

export interface PersistentSessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  domain: string;
  updatedAt: string;
}

@Injectable()
export class SessionPersistenceService {
  private readonly logger = new Logger(SessionPersistenceService.name);
  private readonly sessionDirectory: string;

  constructor() {
    this.sessionDirectory = path.join(process.cwd(), 'storage', 'sessions');
    if (!fs.existsSync(this.sessionDirectory)) {
      fs.mkdirSync(this.sessionDirectory, { recursive: true });
    }
  }

  private getSessionPath(userId: string, domain: string): string {
    const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.sessionDirectory, `session_${userId}_${safeDomain}.json`);
  }

  async saveSession(
    provider: BrowserProvider,
    sessionId: string,
    userId: string,
    domain: string,
  ): Promise<void> {
    this.logger.log(`Persisting secure session cache for user ${userId} on ${domain}`);

    try {
      const cookies = await provider.getCookies(sessionId);
      if (cookies.length === 0) return;

      const sessionPath = this.getSessionPath(userId, domain);
      const sessionData: PersistentSessionData = {
        cookies,
        localStorage: {},
        sessionStorage: {},
        domain,
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf8');
      this.logger.debug(`Session serialized successfully to path: ${sessionPath}`);
    } catch (error: any) {
      this.logger.error(`Failed to serialize browser session context: ${error.message}`);
    }
  }

  async loadSession(
    provider: BrowserProvider,
    sessionId: string,
    userId: string,
    domain: string,
  ): Promise<boolean> {
    const sessionPath = this.getSessionPath(userId, domain);
    if (!fs.existsSync(sessionPath)) {
      this.logger.debug(`No session cache found for user ${userId} on ${domain}`);
      return false;
    }

    try {
      this.logger.log(`Restoring active cookies cache for user ${userId} on ${domain}`);
      const json = fs.readFileSync(sessionPath, 'utf8');
      const data: PersistentSessionData = JSON.parse(json);

      if (data.cookies && data.cookies.length > 0) {
        await provider.setCookies(sessionId, data.cookies);
        this.logger.debug(`Restored ${data.cookies.length} cookies from file storage.`);
        return true;
      }
    } catch (error: any) {
      this.logger.error(`Failed to load cookies session cache: ${error.message}`);
    }

    return false;
  }
}
