import { Injectable, LoggerService, Scope } from '@nestjs/common';
import pino from 'pino';

const transport = pino.transport({
  targets: [
    {
      target: 'pino/file',
      options: { destination: 1 },
      level: process.env.LOG_LEVEL || 'info',
    },
    ...(process.env.LOG_FILE
      ? [
          {
            target: 'pino/file',
            options: { destination: process.env.LOG_FILE },
            level: 'debug',
          },
        ]
      : []),
  ],
});

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      'x-request-id': req.headers?.['x-request-id'],
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.token', 'body.secret'],
    censor: '***',
  },
}, transport);

@Injectable({ scope: Scope.TRANSIENT })
export class PinoLoggerService implements LoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  private get child() {
    return this.context ? logger.child({ context: this.context }) : logger;
  }

  log(message: any, ...optionalParams: any[]) {
    this.child.info(optionalParams[0] || {}, message);
  }

  error(message: any, ...optionalParams: any[]) {
    const params = optionalParams[0];
    const trace = optionalParams[1];
    if (params instanceof Error) {
      this.child.error({ err: params, trace }, message);
    } else {
      this.child.error(params || {}, message);
    }
  }

  warn(message: any, ...optionalParams: any[]) {
    this.child.warn(optionalParams[0] || {}, message);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.child.debug(optionalParams[0] || {}, message);
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.child.trace(optionalParams[0] || {}, message);
  }
}
