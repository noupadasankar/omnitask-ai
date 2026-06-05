// frontend/src/services/websocket.service.ts

import { io, Socket } from 'socket.io-client';
import { ExecutionEventType, ScreenshotFrame } from '@/types/agent';

export class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

        const baseUrl = url.replace(/\/api\/?$/, '');
        this.socket = io(`${baseUrl}/agent`, {
          auth: {
            token,
            userId: typeof window !== 'undefined' ? localStorage.getItem('userId') : null,
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
          this.reconnectAttempts = 0;
          console.log('WebSocket connected');
          resolve();
        });

        this.socket.on('disconnect', () => {
          console.log('WebSocket disconnected');
        });

        this.socket.on('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });

        this.socket.on('connect_error', (error) => {
          this.reconnectAttempts++;
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinSession(sessionId: string, userId: string): void {
    if (!this.socket) return;
    this.socket.emit('session:join', { sessionId, userId });
  }

  leaveSession(sessionId: string): void {
    if (!this.socket) return;
    this.socket.emit('session:leave', { sessionId });
  }

  sendClarificationResponse(sessionId: string, answers: string): void {
    if (!this.socket) return;
    this.socket.emit('clarification:response', { sessionId, answers });
  }

  sendApprovalResponse(
    approvalRequestId: string,
    status: 'APPROVED' | 'DENIED',
  ): void {
    if (!this.socket) return;
    this.socket.emit('approval:respond', { approvalRequestId, status });
  }

  pauseSession(sessionId: string): void {
    if (!this.socket) return;
    this.socket.emit('session:pause', { sessionId });
  }

  resumeSession(sessionId: string): void {
    if (!this.socket) return;
    this.socket.emit('session:resume', { sessionId });
  }

  cancelSession(sessionId: string): void {
    if (!this.socket) return;
    this.socket.emit('session:cancel', { sessionId });
  }

  on(event: string, callback: (data: any) => void): () => void {
    if (!this.socket) {
      return () => {};
    }

    this.socket.on(event, callback);

    return () => {
      if (this.socket) {
        this.socket.off(event, callback);
      }
    };
  }

  once(event: string, callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.once(event, callback);
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const wsService = new WebSocketService();
