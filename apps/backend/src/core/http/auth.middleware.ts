// apps/backend/src/core/http/auth.middleware.ts
//
// Express equivalent of JwtAuthGuard + JwtStrategy
// (apps/backend/src/auth/guards/jwt-auth.guard.ts, jwt.strategy.ts).
// Same contract: Bearer token in Authorization header, same JWT_SECRET,
// same payload shape ({ sub, email, role }), same 401 on missing/invalid/
// expired token or unknown user, and attaches `req.user = { id, email, role }`
// exactly like the Nest guard did (via `req.user.id` used throughout).

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../db/prisma';
import { HttpError } from './error.middleware';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthedRequest extends Request {
  user: { id: string; email: string; role: string };
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authentication required or token invalid');
    }

    const token = authHeader.slice('Bearer '.length);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('❌ JWT_SECRET is not defined in environment');
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch {
      throw new HttpError(401, 'Authentication required or token invalid');
    }

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new HttpError(401, 'Authentication required or token invalid');
    }

    (req as AuthedRequest).user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}
