import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { UseGuards, Logger, UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WsJwtGuard, AuthenticatedUser } from './auth/ws-jwt.guard';
import { RoomService } from './room/room.service';
import { ConfigService } from '@nestjs/config';
import { WsExceptionFilter } from './common/ws-exception.filter';

const msgSync = 0;
const msgAwareness = 1;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class CollabGatewayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollabGatewayGateway.name);

  constructor(
    private roomService: RoomService,
    private configService: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    const userData = client.data.user as AuthenticatedUser;
    if (userData) {
      const { awareness } = this.roomService.getOrCreateDoc(userData.meetingId);
      awarenessProtocol.removeAwarenessStates(awareness, [userData.userId], null);
    }
  }

  @UseGuards(WsJwtGuard)
  @UseFilters(WsExceptionFilter)
  @SubscribeMessage('sync')
  handleSync(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: number[],
  ) {
    const userData = client.data.user as AuthenticatedUser;

    if (!this.roomService.canEdit(userData.role)) {
      this.logger.warn(`User ${userData.userId} (${userData.role}) tried to edit - denied`);
      return;
    }

    const { doc, awareness } = this.roomService.getOrCreateDoc(userData.meetingId);
    const uint8Data = new Uint8Array(data);
    const decoder = decoding.createDecoder(uint8Data);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === msgSync) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, msgSync);
      const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, client);

      if (encoding.length(encoder) > 1) {
        client.send(encoding.toUint8Array(encoder));
      }

      if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
        this.broadcastToRoom(userData.meetingId, data, client.id);
        this.logger.debug(`Broadcast update from user ${userData.userId}`);
      }
    }
  }

  @UseGuards(WsJwtGuard)
  @UseFilters(WsExceptionFilter)
  @SubscribeMessage('awareness')
  handleAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: number[],
  ) {
    const userData = client.data.user as AuthenticatedUser;
    const { awareness } = this.roomService.getOrCreateDoc(userData.meetingId);

    awarenessProtocol.applyAwarenessUpdate(
      awareness,
      new Uint8Array(data),
      client,
    );
    this.broadcastToRoom(userData.meetingId, data, client.id);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('sync-step-1')
  handleSyncStep1(@ConnectedSocket() client: Socket) {
    const userData = client.data.user as AuthenticatedUser;
    const { doc, awareness } = this.roomService.getOrCreateDoc(userData.meetingId);

    awareness.setLocalStateField('user', {
      userId: userData.userId,
      role: userData.role,
      name: `User ${userData.userId}`,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
    });

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, msgSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    client.emit('sync', Array.from(encoding.toUint8Array(encoder)));

    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, msgAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        awareness,
        Array.from(awareness.getStates().keys()),
      ),
    );
    client.emit('awareness', Array.from(encoding.toUint8Array(awarenessEncoder)));

    this.logger.log(
      `User ${userData.userId} joined meeting ${userData.meetingId} with role ${userData.role}`,
    );
  }

  private broadcastToRoom(meetingId: string, data: number[], excludeClientId: string) {
    this.server.emit('sync', data);
  }
}
