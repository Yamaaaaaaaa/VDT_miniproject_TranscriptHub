"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { getSession } from "next-auth/react";
import { TranscriptSegment } from "@/types/transcript";
import { collabApi } from "@/lib/api";

const WS_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_COLLAB_WS_URL ?? "ws://localhost:3008"
    : "";

export interface CollabUser {
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface CollabState {
  connected: boolean;
  synced: boolean;
  users: CollabUser[];
  canEdit: boolean;
  role: string;
  segmentCount: number;
}

export interface CollabSegment extends Omit<TranscriptSegment, "content"> {
  content: string;
  delta: any[];
}

export interface UseCollabOptions {
  meetingId: string;
  initialSegments?: TranscriptSegment[];
  onContentsChange?: (segments: CollabSegment[]) => void;
}

const USER_COLORS = [
  "#E53E3E", "#DD6B20", "#D69E2E", "#38A169",
  "#3182CE", "#805AD5", "#D53F8C", "#00B5D8",
];

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ---------------------------------------------------------------------------
// Singleton — shared across all useCollab() instances for the same meetingId.
// Prevents StrictMode double-mount from creating duplicate WebSocket connections.
// ---------------------------------------------------------------------------

interface CollabInstance {
  doc: Y.Doc;
  ySegmentsArray: Y.Array<Y.Map<any>>;
  connect: () => Promise<void>;
  disconnect: () => void;
  buildSegments: () => CollabSegment[];
  addSubscriber: (fn: () => void) => () => void;
  provider: WebsocketProvider | null;
  /** Role resolved after connect (from JWT) */
  role: string;
  _mountedCount: number;
  _connectDone: boolean;
  /** Timer used to delay disconnect so StrictMode double-mount doesn't reconnect */
  _disconnectTimer: ReturnType<typeof setTimeout> | null;
}

const activeProviders = new Map<string, CollabInstance>();

function getOrCreateCollab(meetingId: string): CollabInstance {
  if (!activeProviders.has(meetingId)) {
    const doc = new Y.Doc();
    // FIX #1: use doc.getArray() so this array is part of the shared Y.Doc graph
    // Previously `new Y.Array()` created a floating array that was never synced
    const ySegmentsArray = doc.getArray<Y.Map<any>>("segments");
    const subscribers = new Set<() => void>();
    let provider: WebsocketProvider | null = null;

    const buildSegments = (): CollabSegment[] => {
      return ySegmentsArray.toArray().map((m) => {
        const id = m.get("id") as string;
        const yText = doc.getText(`content-${id}`);
        return {
          id,
          startTime: Number(m.get("startTime")),
          endTime: Number(m.get("endTime")),
          speaker: m.get("speaker") as string,
          content: yText?.toString() ?? "",
          delta: yText ? yText.toDelta() : [],
        } satisfies CollabSegment;
      });
    };

    const notifySubscribers = () => {
      subscribers.forEach((fn) => fn());
    };

    const connect = async () => {
      if (provider || instance._connectDone) return;

      const session = await getSession();
      const token = session?.accessToken;
      if (!token) {
        console.warn("[Collab] No access token — read-only mode");
        return;
      }

      // Determine role from NextAuth session (set during login in auth.ts)
      const sessionRole = (session.user as any)?.role ?? "VIEWER";
      instance.role = sessionRole;

      provider = new WebsocketProvider(WS_URL, meetingId, doc, {
        params: { token },
        connect: true,
      });

      // FIX #2: Set awareness state so other clients can see this user online.
      // Previously FE never called setLocalState → awareness was always empty.
      const userInfo: CollabUser = {
        id: session.user?.id ?? "",
        name: session.user?.name ?? session.user?.email ?? "Unknown",
        email: session.user?.email ?? "",
        color: pickColor(session.user?.id ?? session.user?.email ?? meetingId),
      };
      provider.awareness.setLocalState({ user: userInfo });

      provider.awareness.on("change", () => notifySubscribers());
      provider.on("sync", () => notifySubscribers());
      ySegmentsArray.observeDeep(() => notifySubscribers());

      instance.provider = provider;
      instance._connectDone = true;

      // Notify once immediately so UI reflects connected state
      notifySubscribers();
    };

    const disconnect = () => {
      if (!provider) return;
      // Clear our presence from awareness before disconnecting
      try { provider.awareness.setLocalState(null); } catch (_) {}
      provider.disconnect();
      provider.destroy();
      provider = null;
      instance.provider = null;
      instance._connectDone = false;
    };

    const instance: CollabInstance = {
      doc,
      ySegmentsArray,
      connect,
      disconnect,
      buildSegments,
      addSubscriber: (fn) => {
        subscribers.add(fn);
        return () => { subscribers.delete(fn); };
      },
      provider: null,
      role: "VIEWER",
      _mountedCount: 0,
      _connectDone: false,
      _disconnectTimer: null,
    };

    activeProviders.set(meetingId, instance);
  }

  return activeProviders.get(meetingId)!;
}

// ---------------------------------------------------------------------------
// useCollab hook
// ---------------------------------------------------------------------------
export function useCollab({
  meetingId,
  initialSegments,
  onContentsChange,
}: UseCollabOptions) {
  const collabRef = useRef<CollabInstance | null>(null);

  const [state, setState] = useState<CollabState>({
    connected: false,
    synced: false,
    users: [],
    canEdit: false,
    role: "VIEWER",
    segmentCount: initialSegments?.length ?? 0,
  });

  const [segments, setSegments] = useState<CollabSegment[]>([]);

  const onContentsChangeRef = useRef(onContentsChange);
  onContentsChangeRef.current = onContentsChange;

  // Initialize singleton
  if (!collabRef.current) {
    collabRef.current = getOrCreateCollab(meetingId);
  }

  const collab = collabRef.current;

  // Seed initial segments from server data (first caller with data wins)
  useEffect(() => {
    if (!collab || !initialSegments?.length) return;
    if (collab.ySegmentsArray.length > 0) return;

    collab.doc.transact(() => {
      initialSegments.forEach((s) => {
        const meta = new Y.Map<any>();
        meta.set("id", s.id);
        meta.set("startTime", s.startTime);
        meta.set("endTime", s.endTime);
        meta.set("speaker", s.speaker);
        collab.ySegmentsArray.push([meta]);

        const yText = collab.doc.getText(`content-${s.id}`);
        yText.applyDelta([{ insert: s.content }]);
      });
    });
    collab.buildSegments();
  }, [collab, initialSegments]);

  // Subscribe to collab state (awareness changes, sync, segment updates)
  useEffect(() => {
    if (!collab) return;

    const updateState = () => {
      const p = collab.provider;
      // FIX #3: properly derive canEdit from resolved role
      const role = collab.role;
      const canEdit = role !== "VIEWER";

      setState((s) => ({
        ...s,
        connected: p?.wsconnected ?? false,
        synced: p?.synced ?? false,
        segmentCount: collab.ySegmentsArray.length,
        role,
        canEdit,
      }));

      if (p) {
        const users: CollabUser[] = [];
        p.awareness.getStates().forEach((st) => {
          if (st.user) users.push(st.user as CollabUser);
        });
        setState((s) => ({ ...s, users }));
      }

      const segs = collab.buildSegments();
      setSegments(segs);
      onContentsChangeRef.current?.(segs);
    };

    const unsub = collab.addSubscriber(updateState);
    updateState();
    return unsub;
  }, [collab]);

  // Mount/unmount: connect on first mount, disconnect on last unmount.
  // FIX #4: use a 150ms timer to absorb React StrictMode double-mount/unmount,
  // preventing a second WebSocket connection from being created.
  useEffect(() => {
    if (!collab) return;

    // Cancel any pending disconnect from the StrictMode cleanup
    if (collab._disconnectTimer) {
      clearTimeout(collab._disconnectTimer);
      collab._disconnectTimer = null;
    }

    collab._mountedCount++;
    collab.connect();

    return () => {
      collab._mountedCount--;
      if (collab._mountedCount <= 0) {
        // Delay so StrictMode remount can cancel this before it fires
        collab._disconnectTimer = setTimeout(() => {
          if (collab._mountedCount <= 0) {
            activeProviders.delete(meetingId);
            collab.disconnect();
          }
          collab._disconnectTimer = null;
        }, 150);
      }
    };
  }, [collab, meetingId]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const getYText = useCallback(
    (segmentId: string): Y.Text | undefined => {
      return collab?.doc.getText(`content-${segmentId}`);
    },
    [collab]
  );

  const addSegment = useCallback(
    (segment: TranscriptSegment) => {
      if (!collab) return;
      collab.doc.transact(() => {
        const meta = new Y.Map<any>();
        meta.set("id", segment.id);
        meta.set("startTime", segment.startTime);
        meta.set("endTime", segment.endTime);
        meta.set("speaker", segment.speaker);
        collab.ySegmentsArray.push([meta]);
        collab.doc.getText(`content-${segment.id}`).insert(0, segment.content ?? "");
      });
    },
    [collab]
  );

  const saveSnapshot = useCallback(async () => {
    if (!collab || !meetingId) return false;

    const segs = collab.buildSegments();
    const rawText = segs
      .map((s) => `[${s.speaker}] ${s.content}`)
      .join("\n");
    const structuredContent = {
      segments: segs.map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        speaker: s.speaker,
        text: s.content,
        delta: s.delta,
      })),
    };

    try {
      // FIX: Route through API Gateway (/api/v1/collab/transcript) which forwards
      // to the collab microservice via TCP. Raw fetch to localhost:3007 was wrong —
      // that port exposes a TCP microservice, not HTTP. The axios instance auto-attaches
      // the Bearer token via the request interceptor in lib/api.ts.
      await collabApi.saveTranscript({ meetingId, rawText, structuredContent });
      return true;
    } catch {
      return false;
    }
  }, [collab, meetingId]);

  return {
    state,
    segments,
    getYText,
    addSegment,
    saveSnapshot,
  };
}
