import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { CollabClientService } from '../collab-client/collab-client.service';

export interface UserAwareness {
  userId: number;
  role: 'HOST' | 'EDITOR' | 'VIEWER';
  name?: string;
  color?: string;
}

@Injectable()
export class RoomService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomService.name);
  private docs = new Map<string, Y.Doc>();
  private awarenessMap = new Map<string, awarenessProtocol.Awareness>();

  constructor(private collabClient: CollabClientService) {}

  onModuleDestroy() {
    this.docs.forEach((doc) => doc.destroy());
  }

  getOrCreateDoc(meetingId: string): { doc: Y.Doc; awareness: awarenessProtocol.Awareness } {
    if (!this.docs.has(meetingId)) {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      this.docs.set(meetingId, doc);
      this.awarenessMap.set(meetingId, awareness);

      this.loadDocument(meetingId, doc);

      return { doc, awareness };
    }

    return {
      doc: this.docs.get(meetingId)!,
      awareness: this.awarenessMap.get(meetingId)!,
    };
  }

  private async loadDocument(meetingId: string, doc: Y.Doc) {
    try {
      const response = await this.collabClient.getTranscript(meetingId);
      if (response.success && response.data) {
        this.initializeDocFromContent(doc, response.data);
        this.logger.log(`Loaded document for meeting ${meetingId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load document: ${error.message}`);
    }
  }

  private initializeDocFromContent(doc: Y.Doc, content: any) {
    const yText = doc.getText('transcript');
    const ySegments = doc.getArray('segments');

    if (content.rawText) {
      yText.insert(0, content.rawText);
    }

    if (content.structuredContent?.segments) {
      ySegments.insert(0, content.structuredContent.segments);
    }
  }

  canEdit(role: string): boolean {
    return role === 'HOST' || role === 'EDITOR';
  }
}
