import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebhookService, WebhookEvent } from './webhook.service';

@Injectable()
export class WebhookListener {
  constructor(private readonly webhookService: WebhookService) {}

  @OnEvent('task.created')
  handleTaskCreated(payload: { userId: string; taskId: string; title: string }) {
    this.dispatch('task.created', payload.userId, payload);
  }

  @OnEvent('task.updated')
  handleTaskUpdated(payload: { userId: string; taskId: string; title: string }) {
    this.dispatch('task.updated', payload.userId, payload);
  }

  @OnEvent('task.cancelled')
  handleTaskCancelled(payload: { userId: string; taskId: string }) {
    this.dispatch('task.cancelled', payload.userId, payload);
  }

  @OnEvent('task.executed')
  handleTaskExecuted(payload: { userId: string; taskId: string; sessionId: string }) {
    this.dispatch('task.executed', payload.userId, payload);
  }

  @OnEvent('file.created')
  handleFileCreated(payload: { userId: string; fileId: string; name: string }) {
    this.dispatch('file.created', payload.userId, payload);
  }

  @OnEvent('file.deleted')
  handleFileDeleted(payload: { userId: string; fileId: string }) {
    this.dispatch('file.deleted', payload.userId, payload);
  }

  @OnEvent('user.updated')
  handleUserUpdated(payload: { userId: string }) {
    this.dispatch('user.updated', payload.userId, payload);
  }

  @OnEvent('agent.session.completed')
  handleAgentSessionCompleted(payload: { userId: string; sessionId: string; goal: string }) {
    this.dispatch('agent.session.completed', payload.userId, payload);
  }

  @OnEvent('agent.session.failed')
  handleAgentSessionFailed(payload: { userId: string; sessionId: string; error: string }) {
    this.dispatch('agent.session.failed', payload.userId, payload);
  }

  private dispatch(event: string, userId: string, payload: unknown) {
    const webhookEvent: WebhookEvent = {
      event,
      userId,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.webhookService.deliver(webhookEvent).catch(() => {});
  }
}
