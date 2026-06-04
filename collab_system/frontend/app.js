import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { QuillBinding } from 'y-quill';

window.addEventListener('load', () => {
  // ===================================================
  // 1. TRÍCH XUẤT MEETING ID ĐỘNG TỪ ĐƯỜNG DẪN URL
  // URL mẫu: http://localhost:8080/?meetingId=hop-tuan-25
  // ===================================================
  const urlParams = new URLSearchParams(window.location.search);
  const meetingId = urlParams.get('meetingId') || 'phong-mac-dinh';
  console.log(`Đang tham gia phiên làm việc có mã phòng: ${meetingId}`);

  // ===================================================
  // 2. KHỞI TẠO BỘ NÃO DỮ LIỆU YJS (CRDT ENGINE)
  // ===================================================
  const ydoc = new Y.Doc();

  // ===================================================
  // 3. THIẾT LẬP KÊNH LƯU TRỮ OFFLINE (INDEXEDDB)
  // Giúp nạp chữ cực nhanh từ ổ cứng và gõ tiếp khi mất mạng
  // ===================================================
  const indexeddbProvider = new IndexeddbPersistence(meetingId, ydoc);
  
  indexeddbProvider.once('synced', () => {
    console.log('Dữ liệu sao lưu offline đã nạp lên màn hình thành công!');
  });

  // ===================================================
  // 4. MỞ KẾT NỐI MẠNG ĐẾN BACK-END LOCAL (WEBSOCKET)
  // Sử dụng window.location.hostname để khớp với IP của trình duyệt
  // ===================================================
  const wsHost = window.location.hostname || 'localhost';
  const wsProvider = new WebsocketProvider(`ws://${wsHost}:1234`, meetingId, ydoc);

  // ===================================================
  // 5. CẤU HÌNH THÔNG TIN TRẠNG THÁI (AWARENESS CRDT)
  // Giả lập thông tin cá nhân sau khi User đăng nhập
  // ===================================================
  const awareness = wsProvider.awareness;

  // Tạo định danh ngẫu nhiên để phân biệt khi test trên cùng một máy
  const userNames = ['Hùng Nguyễn', 'Linh Trần', 'David Đỗ', 'Emmanuelle', 'Minh Vũ', 'Phương Anh'];
  const userColors = ['#ffb61e', '#9b59b6', '#2ecc71', '#e74c3c', '#3498db', '#e67e22'];
  const randomIndex = Math.floor(Math.random() * userNames.length);
  const myUser = {
    name: userNames[randomIndex],
    color: userColors[randomIndex]
  };

  awareness.setLocalStateField('user', myUser);

  // Hiển thị thông tin cá nhân
  const userInfoEl = document.getElementById('user-info');
  if (userInfoEl) {
    userInfoEl.style.display = 'inline-flex';
    userInfoEl.style.backgroundColor = myUser.color + '15';
    userInfoEl.style.color = myUser.color;
    userInfoEl.innerHTML = `Bạn: <strong style="margin-left: 4px;">${myUser.name}</strong>`;
  }

  // Cập nhật số người online và hiển thị log
  const updateOnlineCount = () => {
    const states = Array.from(awareness.getStates().values());
    console.log("Danh sách các tài khoản đang online trong phòng:", states);
    
    const countEl = document.getElementById('online-users-count');
    if (countEl) {
      // Chỉ đếm những user hợp lệ có thông tin 'user'
      const activeUsersCount = states.filter(state => state.user).length;
      countEl.innerText = activeUsersCount;
    }
  };

  awareness.on('change', updateOnlineCount);

  // ===================================================
  // 6. KHỞI TẠO VÀ CẤU HÌNH GIAO DIỆN QUILL EDITOR
  // ===================================================
  // Bắt buộc phải đăng ký module con trỏ chuột với Quill trước
  Quill.register('modules/cursors', QuillCursors);

  const quill = new Quill('#editor-container', {
    modules: {
      cursors: true, // Cho phép hiển thị con trỏ chuột di chuyển thời gian thực
      toolbar: [
        [{ header: [1, 2, false] }],
        ['bold', 'italic', 'underline'],
        ['code-block']
      ],
      history: {
        userOnly: true // QUAN TRỌNG: Ctrl+Z chỉ xóa chữ do CHÍNH MÌNH gõ xuống
      }
    },
    placeholder: 'Bắt đầu nhập nội dung văn bản cộng tác...',
    theme: 'snow'
  });

  // ===================================================
  // 7. THIẾT LẬP LIÊN KẾT ĐỒNG BỘ HAI CHIỀU (BINDING)
  // ===================================================
  const ytext = ydoc.getText('quill-shared-content');
  
  // Truyền: Dữ liệu văn bản thô, Thực thể giao diện, và Trạng thái con trỏ chuột
  const binding = new QuillBinding(ytext, quill, awareness);

  // ===================================================
  // 8. LIÊN KẾT TRẠNG THÁI ĐƯỜNG TRUYỀN WEBSOCKET LÊN UI
  // ===================================================
  const connStatusEl = document.getElementById('conn-status');
  if (connStatusEl) {
    const statusTextEl = connStatusEl.querySelector('.status-text');
    
    wsProvider.on('status', event => {
      console.log(`Trạng thái đường truyền mạng WebSocket: ${event.status}`);
      
      // Xóa các class trạng thái cũ
      connStatusEl.className = 'status-badge';
      
      if (event.status === 'connected') {
        connStatusEl.classList.add('status-connected');
        if (statusTextEl) statusTextEl.innerText = 'Đã kết nối';
      } else if (event.status === 'connecting') {
        connStatusEl.classList.add('status-connecting');
        if (statusTextEl) statusTextEl.innerText = 'Đang kết nối...';
      } else {
        connStatusEl.classList.add('status-disconnected');
        if (statusTextEl) statusTextEl.innerText = 'Đã ngắt kết nối';
      }
    });
  }
});
