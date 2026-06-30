import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VaultService } from './vault.service';
import { StoreCredentialSchema } from './dto/vault.dto';
import type { StoreCredentialDto } from './dto/vault.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('vault')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(private vault: VaultService) {}

  @Post('store')
  async store(
    @Request() req: any,
    @Body(new ZodValidationPipe(StoreCredentialSchema)) body: StoreCredentialDto,
  ) {
    return this.vault.storeCredential(req.user.id, body.service, body.label, body.credentials, body.hints);
  }

  @Get(':service')
  async get(@Request() req: any, @Param('service') service: string) {
    // Returns metadata only — decrypted credentials are never sent over HTTP.
    // Agents access vault.getCredential() internally via service injection.
    const meta = await this.vault.getCredentialMeta(req.user.id, service);
    if (!meta) return { exists: false };
    return { exists: true, service: meta.service, label: meta.label, hints: meta.hints };
  }

  @Get()
  async list(@Request() req: any) {
    return this.vault.listCredentials(req.user.id);
  }

  @Delete(':service')
  async delete(@Request() req: any, @Param('service') service: string) {
    await this.vault.deleteCredential(req.user.id, service);
    return { success: true };
  }
}
