# Hướng dẫn Vận hành & Kiểm thử Hệ thống Chỉnh sửa Văn bản Cộng tác Thời gian thực

Hệ thống này cung cấp một trình soạn thảo văn bản cộng tác thời gian thực (Real-time Collaboration Editor) dựa trên **QuillJS** kết hợp với **Yjs Engine** để xử lý cấu trúc dữ liệu CRDT (chống xung đột), kết nối truyền thông tin thông qua **WebSocket** và hỗ trợ lưu trữ dự phòng ngoại tuyến qua **IndexedDB**.

---

## 📂 Cấu trúc thư mục hiện tại
```plaintext
collab_system/
├── backend/
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── index.html
│   └── app.js
└── README.md (Tài liệu này)
```

---

## 🏃‍♂️ Hướng dẫn vận hành hệ thống

### **Bước 1: Chạy máy chủ Backend (Local WebSocket Server)**

1. Mở terminal/command prompt và di chuyển vào thư mục `backend`:
   ```bash
   cd collab_system/backend
   ```
2. Cài đặt các thư viện cần thiết:
   ```bash
   npm install
   ```
3. Khởi động máy chủ WebSocket:
   ```bash
   npm start
   ```
   *Khi chạy thành công, terminal sẽ hiển thị thông báo:*
   ```plaintext
   ====================================================
     MÁY CHỦ BIÊN TẬP CỘNG TÁC ĐÃ SẴN SÀNG CHẠY LOCAL   
     Địa chỉ kết nối WebSocket: ws://localhost:1234  
   ====================================================
   ```

---

### **Bước 2: Khởi chạy giao diện Frontend**

Vì phần Frontend được xây dựng hoàn toàn từ các file tĩnh (`.html`, `.js`) và sử dụng cơ chế nạp module trực tiếp qua ES Modules từ CDN (`yjs`, `y-websocket`, `y-indexeddb`, `y-quill` được tải dạng `+esm`), bạn hãy mở Frontend qua một máy chủ local để tránh các lỗi bảo mật (như IndexedDB không hoạt động trên `file:///`).

Bạn có thể chạy bằng một trong hai cách sau:

* **Cách 1 (Khuyên dùng):** Sử dụng một web server tĩnh local như [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) trên VS Code.
  > [!NOTE]
  > **Lưu ý về đường dẫn URL của Live Server:**
  > * Nếu bạn bật Live Server từ thư mục gốc của workspace (`VDT_miniproject_TranscriptHub`), URL sẽ là:
  >   `http://127.0.0.1:5500/collab_system/frontend/index.html?meetingId=hop-tuan-25`
  > * Nếu bạn bật Live Server từ thư mục `collab_system`, URL sẽ là:
  >   `http://127.0.0.1:5500/frontend/index.html?meetingId=hop-tuan-25`
  > * Nếu bạn bật Live Server trực tiếp từ thư mục `frontend`, URL sẽ là:
  >   `http://127.0.0.1:5500/index.html?meetingId=hop-tuan-25`
* **Cách 2:** Click đúp chuột trực tiếp vào file [index.html](file:///d:/VDT/VDT_miniproject_TranscriptHub/collab_system/frontend/index.html) để mở bằng trình duyệt web của bạn (sử dụng đường dẫn dạng `file:///...`). Tuy nhiên phương pháp này có thể không lưu trữ được offline qua IndexedDB trên một số trình duyệt do rào cản bảo mật local files.

---

## 🛠️ Kịch bản Kiểm thử Tính năng (Testing Scenarios)

Sau khi khởi chạy thành công cả Backend và Frontend, bạn có thể thực hiện kiểm thử theo các kịch bản sau:

### **1. Kiểm thử đồng bộ thời gian thực (Real-time Sync & Cursors)**
1. Mở hai cửa sổ trình duyệt khác nhau (ví dụ: một cửa sổ ẩn danh và một cửa sổ thường, hoặc hai trình duyệt khác nhau như Chrome & Edge).
2. Truy cập vào cùng một đường dẫn và truyền tham số `meetingId` giống nhau ở thanh địa chỉ URL:
   * **Cửa sổ 1:** `http://127.0.0.1:5500/collab_system/frontend/index.html?meetingId=hop-tuan-25` (hoặc đường dẫn tương ứng với cách bạn chạy Live Server).
   * **Cửa sổ 2:** `http://127.0.0.1:5500/collab_system/frontend/index.html?meetingId=hop-tuan-25`
3. **Thực hiện thao tác:**
   * Di chuyển con trỏ chuột và gõ chữ tại **Cửa sổ 1**.
   * Quan sát **Cửa sổ 2:** Bạn sẽ ngay lập tức thấy con trỏ chuột của Cửa sổ 1 di chuyển với **Tên người dùng** và **Màu đại diện** ngẫu nhiên được vẽ trên màn hình. Văn bản được đồng bộ tức thời mà không xảy ra xung đột hay bị ghi đè.

### **2. Kiểm thử Undo cá nhân (Isolated Undo - `userOnly: true`)**
1. Gõ đồng thời một vài từ ở cả **Cửa sổ 1** và **Cửa sổ 2**.
2. Nhấp chuột vào **Cửa sổ 1** và bấm tổ hợp phím **Ctrl + Z** (hoặc Cmd + Z trên macOS).
3. **Kết quả:** Hệ thống sẽ chỉ hoàn tác (undo) các ký tự do chính người dùng ở Cửa sổ 1 gõ xuống, hoàn toàn giữ nguyên và không gây ảnh hưởng đến phần nội dung do Cửa sổ 2 đã nhập.

### **3. Kiểm thử Khả năng ngoại tuyến (Offline Persistence via IndexedDB)**
1. Tắt terminal của Backend (nhấn **Ctrl + C** tại terminal chạy Node.js server) hoặc ngắt kết nối Internet của bạn.
2. Tiếp tục gõ chữ vào trình soạn thảo ở một cửa sổ.
3. F5 (tải lại trang) cửa sổ đó.
4. **Kết quả:** Nhờ có `y-indexeddb`, toàn bộ nội dung bạn vừa soạn thảo trong lúc mất kết nối vẫn được lưu giữ và hiển thị đầy đủ ngay sau khi tải lại trang bằng cách đọc từ bộ nhớ offline IndexedDB trên ổ cứng.
5. **Đồng bộ lại:** Bật lại Backend (`npm start`). Toàn bộ thay đổi ngoại tuyến sẽ lập tức được tự động đồng bộ sang máy khách còn lại khi có kết nối trở lại.
