import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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

    // 🚨 TEMP USER STORE (replace with DB later)
    const hashedPassword = await bcrypt.hash(password, 10);

    const token = jwt.sign(
      { email, name },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '15m' }
    );

    return NextResponse.json({
      user: { name, email },
      accessToken: token,
    });
  } catch (err) {
    return NextResponse.json(
      { message: 'Registration failed' },
      { status: 500 }
    );
  }
}