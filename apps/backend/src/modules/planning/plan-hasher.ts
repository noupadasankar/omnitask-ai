import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class PlanHasher {
  hash(plan: object): string {
    const canonical = JSON.stringify(plan, Object.keys(plan).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  verify(plan: object, hash: string): boolean {
    return this.hash(plan) === hash;
  }
}