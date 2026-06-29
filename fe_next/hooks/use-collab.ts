"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { getSession } from "next-auth/react";
import { TranscriptSegment } from "@/types/transcript";
import { collabApi } from "@/lib/api";

const WS_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_COLLAB_WS_URL ??
      ((window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/socket.io")
    : "";

export interface CollabUser {
  id: string;
  name: string;
  email: string;
  color: string;
  focus?: {
    segmentId: string;
    field: 'speaker' | 'content';
  } | null;
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
  meetingId?: string | null;
  /**
   * Meeting role của user hiện tại trong meeting này: HOST | EDITOR | VIEWER.
   * Được truyền từ edit page sau khi gọi API getMembers().
   * Lưu ý: session.user.role là system role (ADMIN/USER) — KHÔNG dùng cái đó.
   */
  meetingRole?: string;
  session?: any;
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
// Singleton — dùng chung cho tất cả useCollab() cùng meetingId.
// Ngăn React StrictMode tạo 2 kết nối WebSocket do double-mount.
// ---------------------------------------------------------------------------

interface CollabInstance {
  doc: Y.Doc;
  ySegmentsArray: Y.Array<Y.Map<any>>;
  connect: (session: any) => void;
  disconnect: () => void;
  buildSegments: () => CollabSegment[];
  addSubscriber: (fn: () => void) => () => void;
  forceNotify: () => void;
  addSegmentSubscriber: (fn: () => void) => () => void;
  provider: WebsocketProvider | null;
  /** Vai trò được xác định sau khi kết nối (lấy từ JWT) */
  role: string;
  _mountedCount: number;
  _connectDone: boolean;
  /** Timer trì hoãn disconnect để StrictMode double-mount không reconnect lại */
  _disconnectTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Các segment chờ được seed SAU KHI Y.js sync hoàn tất.
   * Nếu seed trước khi sync, server đã có dữ liệu sẽ gây trùng lặp
   * (hai tab cùng seed độc lập, Y.js merge lại → key bị duplicate).
   */
  _pendingSeeds: TranscriptSegment[] | null;
  /**
   * Meeting role được truyền từ bên ngoài (edit page) sau khi gọi API.
   * Nếu được set, ưu tiên hơn role lấy từ session (vốn là system role).
   */
  _meetingRole: string | null;
  _meetingId?: string | null;
}

const activeProviders = new Map<string, CollabInstance>();

function getOrCreateCollab(meetingId: string): CollabInstance {
  if (!activeProviders.has(meetingId)) {
    // Dùng doc.getArray() để array thuộc Y.Doc graph và được sync
    const doc = new Y.Doc();
    const ySegmentsArray = doc.getArray<Y.Map<any>>("segments");
    const subscribers = new Set<() => void>();
    const segmentSubscribers = new Set<() => void>();
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

    const notifySegmentSubscribers = () => {
      segmentSubscribers.forEach((fn) => fn());
    };

    const connect = (session: any) => {
      if (provider || instance._connectDone) return;

      const token = session?.accessToken;
      if (!token) {
        console.warn("[Collab] Không có access token — chế độ chỉ đọc");
        return;
      }

      // Dùng _meetingRole nếu đã được set từ bên ngoài (HOST/EDITOR/VIEWER — role trong meeting).
      // Fallback: VIEWER (không dùng session.user.role vì đó là system role: ADMIN/USER).
      instance.role = instance._meetingRole ?? "VIEWER";

      // 1. Khai báo WS Provicer: WebsocketProvider là cầu nối giữa Y.Doc local của bạn và WebSocket server — nó tự động lo việc kết nối, đồng bộ và giữ doc luôn nhất quán với tất cả clients.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider = new WebsocketProvider(WS_URL, meetingId, doc, {
        params: { token },
        connect: true,
        // Giảm từ 30s mặc định xuống 5s:
        // Nếu server không gửi message nào trong 5s, client coi kết nối là dead và reconnect.
        // Điều này tránh trường hợp kẹt "Đang đồng bộ..." 30 giây khi server xử lý auth chậm.
        // NOTE: messageReconnectTimeout is supported at runtime but missing from y-websocket typedefs.
        messageReconnectTimeout: 5000,
        // Tự động yêu cầu đồng bộ lại mỗi 10s nếu kết nối đang hoạt động nhưng doc bị lệch.
        resyncInterval: 10000,
      } as any);

      // 2. Cập nhật awareness state để các client khác biết user này đang online. (nếu không gọi setLocalState → awareness luôn rỗng, không thấy ai)
      const userInfo: CollabUser = {
        id: session.user?.id ?? "",
        name: session.user?.name ?? session.user?.email ?? "Unknown",
        email: session.user?.email ?? "",
        color: pickColor(session.user?.id ?? session.user?.email ?? meetingId),
      };
      // Lưu presence vào RAM client + gửi Ws cho Server để lưu awareness + broadcast đồng bộ cho các client khác cùng Room
      provider.awareness.setLocalState({ user: userInfo });

      provider.awareness.on("change", () => notifySubscribers());

      // 3. Seed dữ liệu ban đầu SAU KHI sync để biết server đã có data chưa.
      // Nếu cả 2 tab seed trước khi sync, Y.js merge sẽ gây duplicate key.
      provider.on("sync", (isSynced: boolean) => {
        if (isSynced && instance._pendingSeeds && ySegmentsArray.length === 0) {
          const seeds = instance._pendingSeeds;
          instance._pendingSeeds = null;
          doc.transact(() => {
            seeds.forEach((s) => {
              const meta = new Y.Map<any>();
              meta.set("id", s.id);
              meta.set("startTime", s.startTime);
              meta.set("endTime", s.endTime);
              meta.set("speaker", s.speaker);
              ySegmentsArray.push([meta]);
              const yText = doc.getText(`content-${s.id}`);
              if (yText.length === 0) yText.insert(0, s.content ?? "");
            });
          });
        }
        notifySubscribers();
        notifySegmentSubscribers();
      });

      // Đăng ký lắng nghe sự kiện thay đổi trạng thái kết nối mạng của WebSocket Provider (Online/Offline, Reconnecting...)
      provider.on("status", () => {
        notifySubscribers();
      });

      ySegmentsArray.observeDeep(() => {
        notifySubscribers();
        notifySegmentSubscribers();
      });

      instance.provider = provider;
      instance._connectDone = true;

      // Thông báo ngay lập tức để UI phản ánh trạng thái đã kết nối
      notifySubscribers();
      notifySegmentSubscribers();
    };

    const disconnect = () => {
      if (!provider) return;
      // Xóa presence của user khỏi awareness trước khi ngắt kết nối
      try { provider.awareness.setLocalState(null); } catch (_) { }
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
      forceNotify: () => {
        notifySubscribers();
        notifySegmentSubscribers();
      },
      addSubscriber: (fn) => {
        subscribers.add(fn);
        return () => { subscribers.delete(fn); };
      },
      addSegmentSubscriber: (fn) => {
        segmentSubscribers.add(fn);
        return () => { segmentSubscribers.delete(fn); };
      },
      provider: null,
      role: "VIEWER",
      _mountedCount: 0,
      _connectDone: false,
      _disconnectTimer: null,
      _pendingSeeds: null,
      _meetingRole: null,
      _meetingId: meetingId,
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
  meetingRole,
  session,
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

  // Singleton: Tránh khởi tạo lại kết nối WebSocket nhiều lần
  if (meetingId && (!collabRef.current || collabRef.current._meetingId !== meetingId)) {
    if (collabRef.current) {
      try { collabRef.current.disconnect(); } catch (_) { }
    }
    collabRef.current = getOrCreateCollab(meetingId);
    collabRef.current._meetingId = meetingId;
  }

  const collab = collabRef.current;

  // Đồng bộ meetingRole từ props vào singleton (mỗi khi role thay đổi).
  // Phải làm trước khi connect() chạy để connect() dùng đúng role.
  useEffect(() => {
    if (!collab || !meetingRole) return;
    collab._meetingRole = meetingRole;
    // Nếu đã connect rồi (ví dụ role resolve chậm hơn WS connect) → cập nhật ngay
    if (collab.role !== meetingRole) {
      collab.role = meetingRole;
    }
  }, [collab, meetingRole]);

  // Lưu các segment ban đầu để seed SAU KHI Y.js sync hoàn tất.
  // Việc seed thực sự xảy ra trong event handler "sync" của provider (bên trong connect())
  // để đảm bảo không seed khi chưa biết server đã có data hay chưa.
  useEffect(() => {
    if (!collab || !initialSegments?.length) return;
    // Nếu array đã có data (đồng bộ từ server) → bỏ qua hoàn toàn
    if (collab.ySegmentsArray.length > 0) return;
    // Nếu đã sync rồi (ví dụ StrictMode mount lần 2) → seed ngay nếu vẫn còn rỗng
    if (collab.provider?.synced) {
      if (collab.ySegmentsArray.length === 0) {
        collab.doc.transact(() => {
          initialSegments.forEach((s) => {
            const meta = new Y.Map<any>();
            meta.set("id", s.id);
            meta.set("startTime", s.startTime);
            meta.set("endTime", s.endTime);
            meta.set("speaker", s.speaker);
            collab.ySegmentsArray.push([meta]);
            const yText = collab.doc.getText(`content-${s.id}`);
            if (yText.length === 0) yText.insert(0, s.content ?? "");
          });
        });
      }
      return;
    }
    // Chưa sync — lưu vào pending, event handler sync sẽ apply sau
    collab._pendingSeeds = initialSegments;
  }, [collab, initialSegments]);

  // Đăng ký theo dõi collab state (thay đổi awareness, sync, status)
  useEffect(() => {
    if (!collab) return;

    const updateState = () => {
      const p = collab.provider;
      const role = collab.role;
      const canEdit = role !== "VIEWER";

      setState((s) => {
        const nextConnected = p?.wsconnected ?? false;
        const nextSynced = p?.synced ?? false;
        const nextSegmentCount = collab.ySegmentsArray.length;

        const users: CollabUser[] = [];
        if (p) {
          p.awareness.getStates().forEach((st) => {
            if (st.user) {
              users.push({
                ...(st.user as CollabUser),
                focus: st.focus,
              });
            }
          });
        }

        // So sánh sâu mảng users để tránh cập nhật state khi không có gì đổi
        const usersChanged = JSON.stringify(s.users) !== JSON.stringify(users);
        if (
          s.connected === nextConnected &&
          s.synced === nextSynced &&
          s.segmentCount === nextSegmentCount &&
          s.role === role &&
          s.canEdit === canEdit &&
          !usersChanged
        ) {
          return s;
        }

        return {
          connected: nextConnected,
          synced: nextSynced,
          segmentCount: nextSegmentCount,
          role,
          canEdit,
          users,
        };
      });
    };

    const unsub = collab.addSubscriber(updateState);
    updateState();
    return unsub;
  }, [collab, meetingRole]);

  // Đăng ký theo dõi danh sách segments (chỉ cập nhật khi cấu trúc YJS hoặc speaker thay đổi)
  useEffect(() => {
    if (!collab) return;

    const updateSegments = () => {
      const segs = collab.buildSegments();
      setSegments((prev) => {
        // Kiểm tra xem thực tế có thay đổi cấu trúc không (độ dài mảng hoặc speaker, id của từng segment)
        if (prev.length === segs.length) {
          const hasDiff = prev.some((s, i) => {
            const ns = segs[i];
            return (
              s.id !== ns.id ||
              s.speaker !== ns.speaker ||
              s.startTime !== ns.startTime ||
              s.endTime !== ns.endTime
            );
          });
          if (!hasDiff) return prev;
        }
        return segs;
      });
      onContentsChangeRef.current?.(segs);
    };

    const unsub = collab.addSegmentSubscriber(updateSegments);
    updateSegments();
    return unsub;
  }, [collab]);

  // Quản lý Lifecycle (mount/unmount): tăng giảm đếm số lượng component gắn kết.
  // Chỉ phụ thuộc vào collab và meetingId để đảm bảo tính ổn định của vòng đời,
  // không bị kích hoạt ngắt kết nối khi session token tạm thời tải lại (refresh).
  useEffect(() => {
    if (!collab) return;

    // Hủy pending disconnect từ lần cleanup StrictMode trước
    if (collab._disconnectTimer) {
      clearTimeout(collab._disconnectTimer);
      collab._disconnectTimer = null;
    }

    collab._mountedCount++;

    return () => {
      collab._mountedCount--;
      if (collab._mountedCount <= 0) {
        // Trì hoãn để StrictMode remount có thể hủy trước khi timer chạy
        collab._disconnectTimer = setTimeout(() => {
          if (collab._mountedCount <= 0) {
            if (meetingId) activeProviders.delete(meetingId);
            collab.disconnect();
          }
          collab._disconnectTimer = null;
        }, 150);
      }
    };
  }, [collab, meetingId]);

  // Thực hiện kết nối WebSocket khi có đầy đủ collab instance và session token.
  // Khi token thay đổi hoặc cập nhật, connect() đã được bảo vệ bằng guard (nếu đã kết nối thì bỏ qua).
  // Quan trọng: Sau khi connect() return (dù có guard hay không), ta PHẢI gọi lại
  // notifySubscribers() một lần tường minh để đảm bảo React state nhận được
  // trạng thái synced=true hiện tại từ Singleton còn sống, tránh mãi kẹt "Đang đồng bộ...".
  useEffect(() => {
    if (!collab || !session?.accessToken) return;
    collab.connect(session);
    // Sau khi connect() chạy (kể cả khi bị guard bỏ qua vì đã kết nối sẵn),
    // cưỡng bức flush trạng thái thực tế của provider về React state.
    // Chạy sau một RAF tick để đảm bảo subscriber đã được đăng ký xong.
    const raf = requestAnimationFrame(() => collab.forceNotify());
    return () => cancelAnimationFrame(raf);
  }, [collab, session?.accessToken]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const getYText = useCallback(
    (segmentId: string): Y.Text | undefined => {
      return collab?.doc.getText(`content-${segmentId}`);
    },
    [collab]
  );

  const getAwareness = useCallback(() => {
    return collab?.provider?.awareness;
  }, [collab]);

  const setFocus = useCallback(
    (segmentId: string | null, field: "speaker" | "content" | null) => {
      if (!collab?.provider) return;
      const localState = collab.provider.awareness.getLocalState();
      if (!localState) return;

      collab.provider.awareness.setLocalState({
        ...localState,
        focus: segmentId && field ? { segmentId, field } : null,
      });
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

  const updateSpeaker = useCallback(
    (segmentId: string, speaker: string) => {
      if (!collab) return;
      collab.doc.transact(() => {
        const yMap = collab.ySegmentsArray.toArray().find((m) => m.get("id") === segmentId);
        if (yMap) {
          yMap.set("speaker", speaker);
        }
      });
    },
    [collab]
  );

  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');

  const saveSnapshot = useCallback(async () => {
    if (!collab || !meetingId) return false;
    setSaveStatus('saving');

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
      // FIX: Gửi qua API Gateway (/api/v1/collab/transcript) rồi forward
      // đến collab microservice qua TCP. Gọi thẳng localhost:3007 là sai —
      // port đó expose TCP microservice, không phải HTTP. axios instance tự đính
      // Bearer token qua request interceptor trong lib/api.ts.
      await collabApi.saveTranscript({ meetingId, rawText, structuredContent });
      setSaveStatus('saved');
      return true;
    } catch {
      setSaveStatus('saving');
      return false;
    }
  }, [collab, meetingId]);

  // Cơ chế tự động lưu (Debounce 5s sau khi dừng gõ, Interval 30s khi gõ liên tục)
  useEffect(() => {
    if (!collab || !meetingId) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
    let hasLocalChanges = false;

    const triggerSave = async () => {
      if (!hasLocalChanges) return;
      setSaveStatus('saving');
      console.log("[Collab] Tự động lưu phiên bản (debounce/interval)...");
      const success = await saveSnapshot();
      if (success) {
        hasLocalChanges = false;
        setSaveStatus('saved');
      } else {
        setSaveStatus('saving');
      }
    };

    const handleUpdate = (update: Uint8Array, origin: any) => {
      // Bỏ qua các update nhận về từ WebSocket (thay đổi của người dùng khác)
      if (collab.provider && origin === collab.provider) {
        return;
      }

      hasLocalChanges = true;
      setSaveStatus('saving');

      // Debounce: hẹn giờ lưu sau 5 giây ngừng gõ
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        triggerSave();
        if (throttleTimeout) {
          clearTimeout(throttleTimeout);
          throttleTimeout = null;
        }
      }, 5000);

      // Interval: đảm bảo lưu sau mỗi 30 giây gõ liên tục
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          triggerSave();
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
            debounceTimeout = null;
          }
          throttleTimeout = null;
        }, 30000);
      }
    };

    collab.doc.on("update", handleUpdate);
    return () => {
      collab.doc.on("update", handleUpdate);
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [collab, meetingId, saveSnapshot]);

  const getVersions = useCallback(async () => {
    if (!meetingId) return [];
    try {
      return await collabApi.getVersions(meetingId);
    } catch (err) {
      console.error("[Collab] Lấy danh sách phiên bản thất bại:", err);
      return [];
    }
  }, [meetingId]);

  const getVersionDetail = useCallback(async (versionId: number) => {
    try {
      return await collabApi.getVersionDetail(versionId);
    } catch (err) {
      console.error(`[Collab] Lấy chi tiết phiên bản ${versionId} thất bại:`, err);
      return null;
    }
  }, []);

  const restoreVersion = useCallback(async (versionId: number) => {
    if (!collab || !meetingId) return false;
    try {
      const restored = await collabApi.restoreVersion({ meetingId, versionId });
      if (restored && restored.structuredContent?.segments) {
        // Cập nhật Yjs document ở local để đồng bộ tới tất cả client trong phòng
        collab.doc.transact(() => {
          // Xóa sạch segments hiện tại
          collab.ySegmentsArray.delete(0, collab.ySegmentsArray.length);

          // Nạp lại các segment từ dữ liệu khôi phục
          restored.structuredContent.segments.forEach((s: any) => {
            const meta = new Y.Map<any>();
            meta.set("id", s.id);
            meta.set("startTime", s.startTime);
            meta.set("endTime", s.endTime);
            meta.set("speaker", s.speaker);
            collab.ySegmentsArray.push([meta]);

            const yText = collab.doc.getText(`content-${s.id}`);
            yText.delete(0, yText.length);
            yText.insert(0, s.text ?? "");
          });
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error("[Collab] Phục hồi phiên bản thất bại:", err);
      return false;
    }
  }, [collab, meetingId]);

  return {
    state,
    segments,
    getYText,
    getAwareness,
    setFocus,
    addSegment,
    updateSpeaker,
    saveSnapshot,
    getVersions,
    getVersionDetail,
    restoreVersion,
    saveStatus,
  };
}
