import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'OmniTask AI API';
  }

  getSystemInfo() {
    return {
      name: 'OmniTask AI',
      version: '1.0.0',
      architecture: 'planner-executor-critic',
      worker: 'bull-queue',
    };
  }
}
