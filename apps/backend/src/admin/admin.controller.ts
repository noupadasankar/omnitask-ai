import { Controller, Get, Patch, Delete, Param, Body, UseGuards, Query, Logger } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERADMIN')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getSystemStats();
  }

  @Get('users')
  async listUsers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.listUsers({
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 50,
      role,
    });
  }

  @Patch('users/:id/role')
  @Roles('SUPERADMIN')
  async updateUserRole(
    @Param('id') id: string,
    @Body('role') role: string,
  ) {
    return this.adminService.updateUserRole(id, role);
  }

  @Patch('users/:id/quota')
  async updateUserQuota(
    @Param('id') id: string,
    @Body() quota: { plan?: string; tasksPerDay?: number; storageBytes?: number; concurrentTasks?: number },
  ) {
    return this.adminService.updateUserQuota(id, quota);
  }

  @Delete('users/:id')
  @Roles('SUPERADMIN')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.adminService.getAuditLogs({
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 100,
    });
  }
}
