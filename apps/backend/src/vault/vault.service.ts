import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_DIGEST = 'sha512';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  salt: string;
}

export interface StoredCredential {
  id: string;
  service: string;
  label: string;
  hints: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private masterKey: Buffer;

  constructor(private prisma: PrismaService) {
    const derived = process.env.VAULT_MASTER_KEY;
    if (!derived) {
      throw new Error(
        'VAULT_MASTER_KEY environment variable is required. ' +
        'Set it to a 64-character hex string (32 bytes) before starting the server.',
      );
    }
    this.masterKey = Buffer.from(derived, 'hex');
    if (this.masterKey.length !== KEY_LENGTH) {
      throw new Error(
        `VAULT_MASTER_KEY must be exactly ${KEY_LENGTH * 2} hex characters ` +
        `(got ${derived.length} characters = ${this.masterKey.length} bytes).`,
      );
    }
  }

  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    );
  }

  encrypt(plaintext: string): EncryptedPayload {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return { ciphertext, iv: iv.toString('hex'), tag, salt: salt.toString('hex') };
  }

  decrypt(payload: EncryptedPayload): string {
    const salt = Buffer.from(payload.salt, 'hex');
    const key = this.deriveKey(salt);
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  }

  async storeCredential(
    userId: string,
    service: string,
    label: string,
    credentials: Record<string, string>,
    hints?: string,
  ): Promise<StoredCredential> {
    const encrypted = this.encrypt(JSON.stringify(credentials));

    const record = await this.prisma.credentialVault.upsert({
      where: { userId_service: { userId, service } },
      update: { encrypted: encrypted as any, hints: hints || null, label },
      create: { userId, service, label, encrypted: encrypted as any, hints: hints || null },
    });

    this.logger.log(`Credential stored/updated: ${service} for user ${userId}`);
    return {
      id: record.id,
      service: record.service,
      label: record.label,
      hints: record.hints,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  async getCredential(userId: string, service: string): Promise<Record<string, string> | null> {
    const record = await this.prisma.credentialVault.findUnique({
      where: { userId_service: { userId, service } },
    });

    if (!record || !record.encrypted) return null;

    try {
      const decrypted = this.decrypt(record.encrypted as unknown as EncryptedPayload);
      return JSON.parse(decrypted);
    } catch (err) {
      this.logger.error(`Failed to decrypt credential for ${service}: ${err}`);
      return null;
    }
  }

  // Returns metadata only — no decryption. Used by the HTTP controller so plaintext
  // credentials are never transmitted over the API.
  async getCredentialMeta(userId: string, service: string): Promise<StoredCredential | null> {
    const record = await this.prisma.credentialVault.findUnique({
      where: { userId_service: { userId, service } },
    });
    if (!record) return null;
    return {
      id: record.id,
      service: record.service,
      label: record.label,
      hints: record.hints,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  async listCredentials(userId: string): Promise<StoredCredential[]> {
    const records = await this.prisma.credentialVault.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      service: r.service,
      label: r.label,
      hints: r.hints,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  async deleteCredential(userId: string, service: string): Promise<void> {
    await this.prisma.credentialVault.delete({
      where: { userId_service: { userId, service } },
    });
    this.logger.log(`Credential deleted: ${service} for user ${userId}`);
  }
}
