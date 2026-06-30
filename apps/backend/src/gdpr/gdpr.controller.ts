import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { GdprService } from './gdpr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('gdpr')
@UseGuards(JwtAuthGuard)
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  @Post('export')
  async requestExport(@Req() req: AuthRequest) {
    return this.gdprService.requestExport(req.user.id);
  }

  @Get('exports')
  async getExports(@Req() req: AuthRequest) {
    return this.gdprService.getExports(req.user.id);
  }

  @Post('delete-account')
  async requestDeletion(
    @Req() req: AuthRequest,
    @Body('reason') reason?: string,
  ) {
    return this.gdprService.requestDeletion(req.user.id, reason);
  }
}
