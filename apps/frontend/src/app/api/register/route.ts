import { NextResponse } from 'next/server';

// NOTE: This is a frontend API route stub for development.
// In production, registration is handled by the NestJS backend.
// bcryptjs and jsonwebtoken are backend-only dependencies.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Forward to the backend API for actual registration
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const response = await fetch(`${backendUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Registration failed' }));
      return NextResponse.json(err, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { message: 'Registration failed' },
      { status: 500 }
    );
  }
}