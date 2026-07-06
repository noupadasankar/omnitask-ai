import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(name: string, ownerId: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existing = await this.prisma.team.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Team with this name already exists');

    const team = await this.prisma.team.create({
      data: {
        name,
        slug,
        ownerId,
        members: { create: { userId: ownerId, role: 'OWNER' } },
      },
    });

    await this.auditService.log({
      userId: ownerId, action: 'TEAM_CREATED', resource: 'team', resourceId: team.id,
    });

    return team;
  }

  async findById(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, email: true, name: true } } } },
        invitations: { where: { status: 'PENDING' } },
      },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async findByUser(userId: string) {
    return this.prisma.team.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, email: true, name: true, role: true } } } },
        _count: { select: { members: true, invitations: true } },
      },
    });
  }

  async update(id: string, userId: string, data: { name?: string }) {
    await this.requireRole(id, userId, ['OWNER', 'ADMIN']);

    const updateData: any = {};
    if (data.name) {
      updateData.name = data.name;
      updateData.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    return this.prisma.team.update({ where: { id }, data: updateData });
  }

  async delete(id: string, userId: string) {
    await this.requireRole(id, userId, ['OWNER']);
    await this.prisma.team.delete({ where: { id } });

    await this.auditService.log({
      userId, action: 'TEAM_DELETED', resource: 'team', resourceId: id,
    });
  }

  async addMember(teamId: string, userId: string, requesterId: string, role: string = 'MEMBER') {
    await this.requireRole(teamId, requesterId, ['OWNER', 'ADMIN']);

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (existing) throw new ConflictException('User already a member');

    return this.prisma.teamMember.create({
      data: { teamId, userId, role: role as any },
    });
  }

  async removeMember(teamId: string, userId: string, requesterId: string) {
    await this.requireRole(teamId, requesterId, ['OWNER', 'ADMIN']);

    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === 'OWNER') throw new ForbiddenException('Cannot remove owner');

    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
  }

  async invite(teamId: string, email: string, requesterId: string, role: string = 'MEMBER') {
    await this.requireRole(teamId, requesterId, ['OWNER', 'ADMIN']);

    const existing = await this.prisma.teamInvitation.findFirst({
      where: { teamId, email, status: 'PENDING' },
    });
    if (existing) throw new ConflictException('Invitation already pending');

    const token = uuidv4();
    return this.prisma.teamInvitation.create({
      data: {
        teamId,
        email,
        role: role as any,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedBy: requesterId,
      },
    });
  }

  async acceptInvitation(token: string, userId: string) {
    const invitation = await this.prisma.teamInvitation.findUnique({ where: { token } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') throw new ConflictException('Invitation already processed');
    if (invitation.expiresAt < new Date()) throw new ConflictException('Invitation expired');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== invitation.email) throw new ForbiddenException('Email mismatch');

    await this.prisma.teamMember.create({
      data: { teamId: invitation.teamId, userId, role: invitation.role },
    });

    await this.prisma.teamInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
  }

  private async requireRole(teamId: string, userId: string, allowedRoles: string[]) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a team member');
    if (!allowedRoles.includes(member.role)) throw new ForbiddenException('Insufficient role');
  }
}
