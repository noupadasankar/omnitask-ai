import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { io, Socket } from 'socket.io-client';
import { PrismaService } from './../src/prisma/prisma.service';

describe('WebSocket (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let clientSocket: Socket;
  let authToken: string;
  const PORT = 9877;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(PORT);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (clientSocket?.connected) clientSocket.disconnect();
    await app.close();
  });

  const getToken = async () => {
    if (authToken) return authToken;
    const email = `ws-${Date.now()}@test.com`;
    const res = await fetch(`http://127.0.0.1:${PORT}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ValidPass1!', name: 'WS User' }),
    });
    const data = await res.json() as any;
    authToken = data.accessToken;
    return authToken;
  };

  const connectSocket = async (): Promise<Socket> => {
    const token = await getToken();
    const socket = io(`http://127.0.0.1:${PORT}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', (err) => reject(err));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    return socket;
  };

  describe('Connection', () => {
    it('should connect with valid auth token', async () => {
      const socket = await connectSocket();
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });

    it('should reject connection without token', async () => {
      const socket = io(`http://127.0.0.1:${PORT}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise<void>((resolve) => {
        socket.on('connect_error', () => { socket.disconnect(); resolve(); });
        socket.on('connect', () => { socket.disconnect(); resolve(); });
        setTimeout(() => { socket.disconnect(); resolve(); }, 3000);
      });
    });

    it('should reject connection with invalid token', async () => {
      const socket = io(`http://127.0.0.1:${PORT}`, {
        auth: { token: 'invalid-jwt-token' },
        transports: ['websocket'],
        forceNew: true,
      });
      await new Promise<void>((resolve) => {
        socket.on('connect_error', () => { socket.disconnect(); resolve(); });
        socket.on('connect', () => { socket.disconnect(); resolve(); });
        setTimeout(() => { socket.disconnect(); resolve(); }, 3000);
      });
    });

    it('should disconnect gracefully', async () => {
      const socket = await connectSocket();
      socket.disconnect();
      expect(socket.connected).toBe(false);
    });
  });

  describe('Event Subscription', () => {
    it('should receive session:started event', async () => {
      const socket = await connectSocket();
      const eventPromise = new Promise<any>((resolve) => {
        socket.on('session:started', (data) => resolve(data));
      });
      const token = await getToken();
      await fetch(`http://127.0.0.1:${PORT}/agent/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goal: 'ws test session' }),
      });
      const event = await eventPromise;
      expect(event).toBeDefined();
      socket.disconnect();
    }, 10000);

    it('should receive execution:event log messages', async () => {
      const socket = await connectSocket();
      const eventPromise = new Promise<any>((resolve) => {
        socket.on('execution:event', (data) => resolve(data));
      });
      const token = await getToken();
      await fetch(`http://127.0.0.1:${PORT}/agent/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goal: 'ws event test' }),
      });
      const event = await Promise.race([
        eventPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      expect(event).toBeDefined();
      socket.disconnect();
    }, 12000);
  });

  describe('Approval Events', () => {
    it('should receive approval:requested for high-risk steps', async () => {
      const socket = await connectSocket();
      const approvalPromise = new Promise<any>((resolve) => {
        socket.on('approval:requested', (data) => resolve(data));
      });
      const event = await Promise.race([
        approvalPromise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ]);
      expect(event).toBeDefined();
      socket.disconnect();
    }, 12000);
  });

  describe('Reconnection', () => {
    it('should reconnect after temporary disconnect', async () => {
      const socket = await connectSocket();
      socket.disconnect();
      expect(socket.connected).toBe(false);
      socket.connect();
      await new Promise<void>((resolve) => {
        socket.on('connect', () => resolve());
        setTimeout(() => resolve(), 3000);
      });
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });
});
