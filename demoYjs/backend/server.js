import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const PORT = 1234;

// 1. Khởi tạo một HTTP Server nền tảng
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('WS / COLLAB SERVICE đang chạy ở chế độ Local...\n');
});

// 2. Gắn WebSocket Server vào HTTP Server
const wss = new WebSocketServer({ server });

// 3. Lắng nghe yêu cầu kết nối mạng từ các Client gửi lên
wss.on('connection', (conn, req) => {
  /**
   * Hàm setupWSConnection tự động bóc tách URL để lấy Meeting ID làm tên phòng,
   * quản lý Y.Doc trong RAM, đồng bộ hóa dữ liệu thô ban đầu và tự động 
   * broadcast các gói tin chỉnh sửa chữ lẫn trạng thái chuột (Awareness).
   */
  setupWSConnection(conn, req, {
    gc: true // Tự động dọn dẹp bộ nhớ RAM khi không còn ai gõ chữ
  });

  console.log(`[WS CONNECT] Người dùng tham gia kết nối vào phòng: ${req.url}`);
});

// 4. Kích hoạt cổng lắng nghe
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  MÁY CHỦ BIÊN TẬP CỘNG TÁC ĐÃ SẴN SÀNG CHẠY LOCAL   `);
  console.log(`  Địa chỉ kết nối WebSocket: ws://localhost:${PORT}  `);
  console.log(`====================================================`);
});
