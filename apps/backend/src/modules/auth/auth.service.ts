import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload { sub: string; email: string; iat?: number; exp?: number; }
export interface AuthTokens { accessToken: string; refreshToken: string; expiresIn: number; }

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash },
    });

    this.logger.log(`New user registered: ${user.email}`);
    return this.generateTokens(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.generateTokens(user.id, user.email);
  }

  async refresh(userId: string, refreshToken: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException('Session expired');

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');

    return this.generateTokens(user.id, user.email);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
  }

  async validatePayload(payload: JwtPayload) {
    return this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true, role: true } });
  }

  private async generateTokens(userId: string, email: string): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, { expiresIn: '15m' }),
      this.jwt.signAsync(payload, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: '7d' }),
    ]);

    const refreshHash = await bcrypt.hash(refreshToken, this.SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: refreshHash } });

    return { accessToken, refreshToken, expiresIn: 900 };
  }
}