import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

interface AuthRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN';
    return this.auditService.findAll({
      userId: isAdmin ? undefined : req.user.id,
      action,
      resource,
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 50,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('count')
  async count(
    @Req() req: AuthRequest,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN';
    return this.auditService.count({
      userId: isAdmin ? undefined : req.user.id,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  async findAllAdmin(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.auditService.findAll({
      userId,
      action,
      resource,
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 100,
    });
  }
}
