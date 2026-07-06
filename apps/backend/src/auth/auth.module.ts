import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './guards/jwt.strategy';
import { GoogleStrategy } from './guards/google.strategy';

import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') } as jwt.SignOptions,
      }),
    }),
  ],

  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
  ],

  controllers: [AuthController],

  exports: [
    AuthService,
    JwtModule,
  ],
})
export class AuthModule { }
