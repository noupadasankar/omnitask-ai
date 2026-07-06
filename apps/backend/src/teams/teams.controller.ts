import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  async create(@Body('name') name: string, @Req() req: AuthRequest) {
    return this.teamsService.create(name, req.user.id);
  }

  @Get('mine')
  async getMyTeams(@Req() req: AuthRequest) {
    return this.teamsService.findByUser(req.user.id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body('name') name: string, @Req() req: AuthRequest) {
    return this.teamsService.update(id, req.user.id, { name });
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.teamsService.delete(id, req.user.id);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role?: string },
    @Req() req: AuthRequest,
  ) {
    return this.teamsService.addMember(id, body.userId, req.user.id, body.role);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    return this.teamsService.removeMember(id, userId, req.user.id);
  }

  @Post(':id/invitations')
  async invite(
    @Param('id') id: string,
    @Body() body: { email: string; role?: string },
    @Req() req: AuthRequest,
  ) {
    return this.teamsService.invite(id, body.email, req.user.id, body.role);
  }

  @Post('invitations/:token/accept')
  async acceptInvitation(@Param('token') token: string, @Req() req: AuthRequest) {
    return this.teamsService.acceptInvitation(token, req.user.id);
  }
}
