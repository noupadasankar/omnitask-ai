import { NextResponse } from 'next/server';

/**
 * This Next.js route is a no-op placeholder.
 *
 * Your real auth endpoints live in the backend at:
 *   ${process.env.NEXT_PUBLIC_API_URL}/api/auth/*
 *
 * The frontend calls those backend endpoints via apps/frontend/src/services/auth.service.ts
 * (through apps/frontend/src/services/api.ts).
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, message: 'Use backend /api/auth/* for authentication.' },
    { status: 501 },
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, message: 'Use backend /api/auth/* for authentication.' },
    { status: 501 },
  );
}

