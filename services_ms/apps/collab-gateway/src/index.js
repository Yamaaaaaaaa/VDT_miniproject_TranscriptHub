import http from 'http';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { authMiddleware } from './middleware/auth.js';
import { roleMiddleware } from './middleware/role.js';
import { redisService, redis } from './services/redis.js';
import { logger } from './utils/logger.js';

const PORT = parseInt(process.env.WS_PORT || '3008', 10);
const server = http.createServer();
const wss = new WebSocketServer({ server });

// ===========================================================================
// PHẦN 1: CÁC HẰNG SỐ GIAO THỨC Y.JS (y-websocket message type constants)
// ===========================================================================
// Định nghĩa các loại bản tin theo đặc tả của y-websocket (bắt buộc khớp với client)
const messageSync = 0;        // Giao thức Y.js: Bắt tay đồng bộ (Sync handshake) và cập nhật dữ liệu tài liệu
const messageAwareness = 1;   // Giao thức Y.js: Cập nhật trạng thái người dùng (online, con trỏ soạn thảo)

// ===========================================================================
// PHẦN 2: BỘ LƯU TRỮ TÀI LIỆU (Document Store - Singleton Y.Doc per Room)
// ===========================================================================
// Bản đồ docs lưu trữ thông tin phòng họp trong RAM, được tái sử dụng qua nhiều kết nối
const docs = new Map();

/**
 * Tìm hoặc tạo mới phòng họp (Y.Doc) theo meetingId.
 * Khởi tạo kèm theo quản lý awareness và lên lịch dọn dẹp.
 */
function getOrCreateDoc(meetingId) {
  if (!docs.has(meetingId)) {
    const doc = new Y.Doc();
    doc.gc = true; // Bật tính năng dọn dẹp rác (garbage collection) của Yjs để tối ưu RAM
    docs.set(meetingId, {
      doc,
      awareness: new awarenessProtocol.Awareness(doc),
      connections: new Set(),
      cleanupTimeout: null,
    });
    logger.info(`[WS] Đã tạo tài liệu Y.js mới cho phòng họp ${meetingId}`);
  }
  return docs.get(meetingId);
}

// ===========================================================================
// PHẦN 3: CÁC HÀM TRUYỀN TẢI & PHÁT TIN (Broadcasting & Utility Functions)
// ===========================================================================

/**
 * Phát tán (Broadcast) một bản cập nhật nhị phân Y.Doc tới toàn bộ kết nối trong phòng, trừ kết nối gửi (excludeConn).
 * Sử dụng messageSync (loại 0) làm byte định dạng đầu tiên theo giao thức y-websocket.
 */
function broadcastUpdate(docEntry, update, excludeConn = null) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync); // Byte định dạng loại tin nhắn (0)
  syncProtocol.writeUpdate(encoder, update);
  const msg = encoding.toUint8Array(encoder);
  docEntry.connections.forEach((conn) => {
    if (conn !== excludeConn && conn.readyState === 1) {
      conn.send(msg);
    }
  });
}

/**
 * Phát tán (Broadcast) trạng thái online/con trỏ (awareness) tới toàn bộ kết nối trong phòng, trừ kết nối gửi (excludeConn).
 * Sử dụng messageAwareness (loại 1) làm byte định dạng đầu tiên theo giao thức y-websocket.
 */
function broadcastAwarenessUpdate(docEntry, changedClients, excludeConn = null) {
  if (!changedClients.length) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness); // Byte định dạng loại tin nhắn (1)
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(docEntry.awareness, changedClients)
  );
  const msg = encoding.toUint8Array(encoder);
  docEntry.connections.forEach((conn) => {
    if (conn !== excludeConn && conn.readyState === 1) {
      conn.send(msg);
    }
  });
}

/**
 * Gửi Sync Step 1 (Vector trạng thái hiện tại của tài liệu) tới một client vừa kết nối.
 * Sử dụng messageSync (loại 0).
 */
function sendSyncStep1(conn, doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync); // Byte định dạng loại tin nhắn (0)
  syncProtocol.writeSyncStep1(encoder, doc);
  conn.send(encoding.toUint8Array(encoder));
}

// ===========================================================================
// PHẦN 4: XỬ LÝ GÓI TIN ĐẦU VÀO (Inbound Binary Message Handler)
// ===========================================================================

/**
 * Phân tích và xử lý các bản tin nhị phân nhận được từ Client.
 * Giao thức y-websocket gửi 2 loại gói tin:
 *   loại 0 (messageSync)      — Chứa bắt tay đồng bộ Step 1, Step 2 và các cập nhật chỉnh sửa.
 *   loại 1 (messageAwareness) — Chứa vị trí con trỏ chuột và trạng thái hoạt động.
 */
function handleMessage(conn, docEntry, message) {
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync: { // Loại 0 — Bắt tay đồng bộ / Cập nhật tài liệu
      // Kiểm tra loại gói tin con (subtype) để bảo vệ quyền Chỉ đọc (Read-only)
      const syncDecoder = decoding.createDecoder(message);
      decoding.readVarUint(syncDecoder); // Bỏ qua byte messageSync (loại 0)
      const syncType = decoding.readVarUint(syncDecoder); // Lấy loại sync (1: Step 1, 2: Step 2 hoặc Update)

      // Chặn các bản cập nhật chỉnh sửa (syncType = 2) từ người dùng có quyền chỉ đọc
      if (conn.isReadOnly && syncType === 2) {
        logger.warn(`[WS] Người dùng chỉ xem ${conn.userId} bị chặn gửi bản cập nhật chỉnh sửa (syncType 2)`);
        break;
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, docEntry.doc, null);
      if (encoding.length(encoder) > 1) {
        conn.send(encoding.toUint8Array(encoder));
      }
      break;
    }
    case messageAwareness: { // Loại 1 — Cập nhật trạng thái con trỏ/online từ client
      const update = decoding.readVarUint8Array(decoder);
      // Theo dõi danh sách clientID của Y.js thuộc kết nối này để dọn dẹp khi ngắt kết nối
      try {
        const tmpDecoder = decoding.createDecoder(update);
        const numClients = decoding.readVarUint(tmpDecoder);
        for (let j = 0; j < numClients; j++) {
          const clientID = decoding.readVarUint(tmpDecoder);
          conn.awarenessClientIDs.add(clientID);
          decoding.readVarString(tmpDecoder); // Bỏ qua chuỗi JSON biểu diễn trạng thái
        }
      } catch (_) { /* Bỏ qua lỗi cú pháp nếu gói tin bị hỏng */ }
      // Áp dụng cập nhật trạng thái và truyền phát thông qua sự kiện 'change'
      awarenessProtocol.applyAwarenessUpdate(docEntry.awareness, update, conn);
      break;
    }
    default:
      logger.warn(`[WS] Nhận được loại tin nhắn lạ: ${messageType}`);
  }
}

// ===========================================================================
// PHẦN 5: THIẾT LẬP KẾT NỐI MỚI (Connection Lifecycle Handler)
// ===========================================================================

wss.on('connection', async (conn, req) => {
  // Client y-websocket gửi thông tin phòng qua đường dẫn URL: ws://host/{meetingId}?token=xxx
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  // Chuyển đổi định dạng đường dẫn từ "/socket.io/{uuid}" hoặc "/{uuid}" thành "{uuid}"
  const meetingId = url.pathname.replace(/^\//, '').replace(/^socket\.io\//, '');

  if (!token || !meetingId) {
    conn.close(4001, 'Missing token or meetingId');
    logger.warn(`[WS] Từ chối kết nối: token=${!!token} meetingId="${meetingId}"`);
    return;
  }

  try {
    // -----------------------------------------------------------------------
    // Tối ưu hóa: Chạy xác thực token và kiểm tra quyền song song.
    // Cách làm cũ: Tuần tự authMiddleware (đồng bộ) rồi roleMiddleware (HTTP/DB: ~3s) → Tốn ~3s-6s.
    // Cách làm mới: Hai luồng chạy song song để chỉ mất thời gian của bước chậm nhất.
    // -----------------------------------------------------------------------

    // Bước 1: authMiddleware xác thực chữ ký JWT locally (đồng bộ, cực nhanh < 1ms)
    // Nếu chữ ký hết hạn hoặc hỏng, nó mới tự động fallback gọi Identity Service (tối đa 3s)
    const user = await authMiddleware(token);
    if (!user) {
      conn.close(4001, 'Unauthorized');
      return;
    }

    // Bước 2: Khởi tạo phòng họp và gửi syncStep1 NGAY LẬP TỨC sau khi xác thực danh tính.
    // KHÔNG chờ truy vấn role xong. Client sẽ hoàn tất bắt tay đồng bộ (Sync Handshake) sớm nhất có thể.
    // Kiểm tra vai trò (Role check) tiếp tục được xử lý bất đồng bộ dưới nền.
    const docEntry = getOrCreateDoc(meetingId);
    docEntry.connections.add(conn);

    // Huỷ lịch dọn dẹp phòng họp nếu có người dùng kết nối lại
    if (docEntry.cleanupTimeout) {
      clearTimeout(docEntry.cleanupTimeout);
      docEntry.cleanupTimeout = null;
      logger.info(`[WS] Đã huỷ lịch dọn dẹp phòng họp ${meetingId}`);
    }

    conn.userId = user.id;
    conn.role = 'VIEWER'; // Mặc định gán vai trò VIEWER lúc khởi đầu kết nối
    conn.meetingId = meetingId;
    conn.awarenessClientIDs = new Set();
    conn.isReadOnly = true; // Mặc định chế độ Chỉ đọc lúc khởi đầu để đảm bảo an toàn dữ liệu

    logger.info(`[WS] Người dùng ${user.id} (chờ cập nhật role) đã tham gia cuộc họp ${meetingId}`);

    // Đăng ký chuyển tiếp thay đổi trạng thái hoạt động (awareness) tới các người dùng khác
    const awarenessHandler = ({ added, updated, removed }) => {
      const changedClients = [...added, ...updated, ...removed];
      broadcastAwarenessUpdate(docEntry, changedClients, conn);
    };
    docEntry.awareness.on('change', awarenessHandler);

    // Đăng ký chuyển tiếp thay đổi nội dung văn bản tới các người dùng khác
    const updateHandler = (update, origin) => {
      if (origin !== conn) {
        broadcastUpdate(docEntry, update, origin);
      }
    };
    docEntry.doc.on('update', updateHandler);

    // Lắng nghe và xử lý tin nhắn đầu vào từ kết nối hiện tại
    conn.on('message', (rawMessage) => {
      try {
        handleMessage(conn, docEntry, new Uint8Array(rawMessage));
      } catch (err) {
        logger.error(`[WS] Lỗi xử lý tin nhắn: ${err.message}`);
      }
    });

    // Dọn dẹp tài nguyên khi người dùng đóng kết nối
    conn.on('close', () => {
      docEntry.connections.delete(conn);
      // Xóa sự hiện diện của người dùng khỏi awareness
      if (conn.awarenessClientIDs.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          docEntry.awareness,
          [...conn.awarenessClientIDs],
          conn
        );
      }
      docEntry.awareness.off('change', awarenessHandler);
      docEntry.doc.off('update', updateHandler);
      logger.info(`[WS] Người dùng ${user.id} đã thoát khỏi cuộc họp ${meetingId}`);

      // Lên lịch dọn dẹp phòng họp (Lazy Cleanup) sau 2 phút nếu không còn ai online
      if (docEntry.connections.size === 0) {
        logger.info(`[WS] Phòng họp ${meetingId} không còn ai online. Lên lịch dọn dẹp sau 2 phút...`);
        if (docEntry.cleanupTimeout) {
          clearTimeout(docEntry.cleanupTimeout);
        }
        docEntry.cleanupTimeout = setTimeout(() => {
          if (docEntry.connections.size === 0) {
            docs.delete(meetingId); // Xóa tài liệu khỏi bộ nhớ RAM
            logger.info(`[WS] Đã giải phóng bộ nhớ RAM của phòng họp ${meetingId} do không có hoạt động.`);
          }
        }, 120000); // 2 phút (120,000ms)
      }
    });

    // Bắt đầu quá trình đồng bộ hóa bằng cách gửi Vector trạng thái ngay lập tức
    sendSyncStep1(conn, docEntry.doc);

    // Gửi danh sách trạng thái online của phòng họp hiện tại cho người dùng vừa kết nối
    const awarenessStates = docEntry.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness); // Byte định dạng loại tin nhắn (1)
      const updateData = awarenessProtocol.encodeAwarenessUpdate(
        docEntry.awareness,
        Array.from(awarenessStates.keys())
      );
      encoding.writeVarUint8Array(encoder, updateData);
      conn.send(encoding.toUint8Array(encoder));
    }

    // Luồng bất đồng bộ: Xác thực vai trò chạy ngầm dưới nền
    roleMiddleware(meetingId, user.id)
      .then((role) => {
        if (conn.readyState !== 1) return; // Kết nối đã bị ngắt trước khi lấy xong role
        conn.role = role;
        conn.isReadOnly = role === 'VIEWER'; // Cho phép sửa nếu vai trò là HOST hoặc EDITOR
        logger.info(`[WS] Người dùng ${user.id} được phân vai trò thực tế: ${role} trong cuộc họp ${meetingId}`);
      })
      .catch((err) => {
        logger.warn(`[WS] Xác thực vai trò thất bại cho người dùng ${user.id}, mặc định gán VIEWER: ${err.message}`);
        // Chế độ mặc định VIEWER + isReadOnly = true được duy trì
      });

  } catch (error) {
    logger.error(`[WS] Lỗi thiết lập kết nối: ${error.message}`);
    conn.close(4001, 'Authentication failed');
  }
});

// Khởi chạy máy chủ HTTP và lắng nghe cổng WebSocket
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Collab Gateway đang chạy tại địa chỉ ws://0.0.0.0:${PORT}`);
  logger.info(`Đường dẫn Health check: http://0.0.0.0:${PORT}/health`);
});

// Endpoint kiểm tra sức khỏe của dịch vụ (Health check REST endpoint)
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'collab-gateway',
      activeRooms: docs.size,
    }));
    return;
  }
});

// ===========================================================================
// PHẦN 6: ĐỒNG BỘ VAI TRÒ CHẠY NGẦM (Real-time Redis Member Role Updates)
// ===========================================================================
// Gateway lắng nghe các cập nhật thành viên từ Identity Service thông qua Redis Pub/Sub
const subRedis = redis.duplicate();
subRedis.subscribe('meeting_member_updated')
  .then(() => logger.info('[WS] Đã đăng ký thành công kênh Redis Pub/Sub: meeting_member_updated'))
  .catch((err) => logger.error('[WS] Lỗi đăng ký kênh Redis:', err.message));

subRedis.on('message', (channel, message) => {
  if (channel === 'meeting_member_updated') {
    try {
      const { meetingId, userId, role } = JSON.parse(message);
      logger.info(`[WS] Nhận cập nhật vai trò từ Redis Pub/Sub: Người dùng ${userId} trong phòng ${meetingId} -> vai trò ${role}`);

      wss.clients.forEach((conn) => {
        if (conn.meetingId === meetingId && conn.userId === userId) {
          // Cập nhật quyền hạn thực tế trong RAM lập tức
          conn.role = role || 'NONE';
          conn.isReadOnly = (role === 'VIEWER' || !role);

          // Gửi bản tin Text Frame thông báo cho client Next.js cập nhật lại React State
          conn.send(JSON.stringify({
            type: 'ROLE_UPDATED',
            role: role || 'NONE',
          }));
          logger.info(`[WS] Đã truyền tin cập nhật quyền tới client người dùng ${userId} (isReadOnly: ${conn.isReadOnly})`);
        }
      });
    } catch (err) {
      logger.error(`[WS] Lỗi phân tích tin nhắn Pub/Sub từ Redis: ${err.message}`);
    }
  }
});

// Tắt máy chủ an toàn (Graceful Shutdown)
process.on('SIGTERM', () => {
  logger.info('Nhận tín hiệu SIGTERM, đang dừng máy chủ...');
  try { subRedis.disconnect(); } catch (_) {}
  wss.close();
  server.close();
  process.exit(0);
});

// Hàm hỗ trợ chọn màu sắc đại diện ngẫu nhiên cố định cho mỗi người dùng dựa trên ID của họ
function pickColor(seed) {
  const colors = ['#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#3182CE', '#805AD5', '#D53F8C', '#00B5D8'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
