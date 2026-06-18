import * as Y from 'yjs';
import { collabService } from '../services/collab.js';
import { logger } from '../utils/logger.js';

export class RoomManager {
  constructor() {
    this.docs = new Map();
    this.awareness = new Map();
  }

  getOrCreateDoc(meetingId) {
    if (!this.docs.has(meetingId)) {
      const doc = new Y.Doc();
      const awareness = new Y.Awareness(doc);
      this.docs.set(meetingId, doc);
      this.awareness.set(meetingId, awareness);
      this.loadDocument(meetingId, doc);
      logger.info(`[RoomManager] Created doc for meeting ${meetingId}`);
    }
    return {
      doc: this.docs.get(meetingId),
      awareness: this.awareness.get(meetingId),
    };
  }

  async loadDocument(meetingId, doc) {
    try {
      const result = await collabService.getTranscript(meetingId);
      if (result.success && result.data) {
        const yText = doc.getText('transcript');
        const ySegments = doc.getArray('segments');

        if (result.data.rawText) {
          doc.transact(() => {
            yText.insert(0, result.data.rawText);
          });
        }

        if (result.data.structuredContent?.segments) {
          ySegments.insert(0, result.data.structuredContent.segments);
        }

        logger.info(`[RoomManager] Loaded document for meeting ${meetingId}`);
      }
    } catch (err) {
      logger.error(`[RoomManager] Failed to load document: ${err.message}`);
    }
  }

  canEdit(role) {
    return role === 'HOST' || role === 'EDITOR';
  }

  destroy() {
    this.docs.forEach((doc) => doc.destroy());
    this.awareness.forEach((aw) => aw.destroy());
    this.docs.clear();
    this.awareness.clear();
  }
}
