import { Module, Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
@Injectable()
export class WsGateway {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) client.join(userId);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(userId).emit(event, data);
  }
}

@Module({
  providers: [WsGateway],
  exports: [WsGateway],
})
export class WsModule {}