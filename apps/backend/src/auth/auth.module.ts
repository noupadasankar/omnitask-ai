import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './guards/jwt.strategy';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,

    // ✅ Passport with default strategy
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // ✅ Secure async JWT configuration
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],

  providers: [
    AuthService,
    JwtStrategy,
  ],

  controllers: [AuthController],

  exports: [
    AuthService,
    JwtModule, // 👈 important for other modules
  ],
})
export class AuthModule { }