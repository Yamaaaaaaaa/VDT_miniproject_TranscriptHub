# Kiến Trúc Chỉnh Sửa Văn Bản Cộng Tác Thời Gian Thực (Collaborative Transcript Editing)

Tài liệu này nghiên cứu và đề xuất phương án thiết kế hệ thống chỉnh sửa văn bản cộng tác thời gian thực (Real-time Collaborative Editing) áp dụng cho tính năng hiệu chỉnh **Bản dịch cuộc họp (Meeting Transcript)** dựa trên công nghệ **Yjs**, **CRDTs (Conflict-free Replicated Data Types)**, và trình soạn thảo **Quill JS**.

Đặc biệt, tài liệu giải quyết bài toán cốt lõi: **Làm thế nào để chỉnh sửa cộng tác đồng thời theo từng giai đoạn (segments/timestamps) của tệp âm thanh ghi âm cuộc họp** mà vẫn đảm bảo tính toàn vẹn dữ liệu, hiệu năng cao và trải nghiệm người dùng tối ưu.

---

## 1. Kiến Trúc Hệ Thống Tổng Thể Khi Tích Hợp Tính Năng Cộng Tác

Khi tích hợp tính năng chỉnh sửa cộng tác thời gian thực cho bản dịch Transcript, hệ thống bổ sung thêm một dịch vụ trung gian chuyên biệt: **Collaboration Gateway (Collab Service)** đóng vai trò là một WebSocket Room Broker chạy ngầm trên RAM.

### Sơ đồ liên kết các dịch vụ trong hệ thống:

```
                    ┌───────────────────────────────────────────────┐
                    │                Docker Network                 │
                    │                                               │
  Browser (Client) ─┼─WebSocket (ws/wss)─► Collab Gateway :3007     │
                    │                        │                      │
  Browser (Client) ─┼───REST API (HTTP)──► API Gateway :3000        │
                    │                        │                      │
                    │       ┌────────────────┼────────────────┐     │
                    │       ▼ (TCP)          ▼ (gRPC)         ▼ (TCP)│
                    │  Transcript MS     Meeting MS       Identity MS│
                      │     :3005            :3006          :3001/3002 │
                    │                                               │
                    │  Collab Gateway (WS)                          │
                    │       ├── Direct Sync / Debounce ──► Postgres │
                    │       └── Redis Adapter (Pub/Sub) ──► Redis   │
                    └───────────────────────────────────────────────┘
```

* **Client Browser (Next.js)**: Sử dụng các thư viện `yjs`, `y-websocket` và `y-indexeddb` để xử lý và hiển thị văn bản soạn thảo qua Quill Editor.
* **Collaboration Gateway (Collab Service)**:
  * Được viết bằng NestJS sử dụng `@nestjs/websockets` hoặc chạy thư viện Node.js `y-websocket` độc lập.
  * Lắng nghe các kết nối qua cổng WebSocket, thực hiện xác thực và phân quyền người dùng trước khi cấp quyền kết nối vào phòng họp (`Room`).
  * Duy trì thực thể `Y.Doc` trên bộ nhớ RAM để làm cầu nối chuyển tiếp các bản ghi cập nhật nhị phân giữa các client trong cùng phòng.
  * Tích hợp **Redis Adapter** để mở rộng quy mô (Scale Out) khi triển khai chạy nhiều instance của Collab Gateway phía sau bộ cân bằng tải (Load Balancer).
* **Các Dịch vụ Microservices liên quan**:
  * **Meeting Service**: Dùng để đối chiếu quyền hạn thành viên của cuộc họp (`HOST`, `EDITOR`, `VIEWER`).
  * **Transcript Service**: Dùng để nạp dữ liệu ban đầu từ cơ sở dữ liệu lên phòng và lưu trữ trạng thái văn bản hoàn chỉnh sau khi cuộc họp kết thúc hoặc tự động lưu.

---

## 2. Giải Thích Cơ Chế CRDTs (Conflict-free Replicated Data Types)

**CRDTs (Conflict-free Replicated Data Types)** là tập hợp các cấu trúc dữ liệu toán học (như văn bản, tập hợp, bản đồ) được thiết kế đặc biệt cho các hệ thống phân tán. Chúng cho phép nhiều máy khách cập nhật dữ liệu độc lập và đồng thời mà không cần điều phối bởi máy chủ trung tâm, nhưng vẫn đảm bảo tất cả các máy sẽ hội tụ (converge) về một trạng thái giống hệt nhau khi nhận đủ các cập nhật.

### 2.1 Tại sao CRDTs vượt trội hơn OT (Operational Transformation)?

| Đặc tính | Operational Transformation (OT) | Conflict-free Replicated Data Types (CRDTs) |
| :--- | :--- | :--- |
| **Vai trò của Server** | Phải là trọng tài trung tâm để tính toán lại vị trí chèn ký tự (Transformation) khi có xung đột. | Chỉ là Hub chuyển tiếp gói tin, không cần phân tích logic xung đột của văn bản. |
| **Khả năng Offline** | Phức tạp và dễ gây lỗi mất đồng bộ khi người dùng offline lâu rồi kết nối lại. | Tự nhiên và mượt mà nhờ việc lưu trữ lịch sử dưới dạng cấu trúc cây logic có định danh. |
| **Độ tin cậy** | Dễ bị lệch dòng thời gian (divergence) nếu thứ tự gói tin đến server bị thay đổi. | Đảm bảo hội tụ tuyệt đối bất kể thứ tự nhận gói tin (nhờ tính chất giao hoán, kết hợp, lũy đẳng). |

### 2.2 Cách thức Yjs tổ chức CRDT dưới bộ nhớ
Yjs sử dụng giải thuật **CRDT dựa trên cấu trúc liên kết (Sequence CRDT)**:
1. **Định danh ký tự độc nhất**: Mỗi khi một ký tự hoặc một phần tử được chèn vào văn bản, Yjs cấp cho nó một mã định danh duy nhất gồm cặp số `(ID_Client, Logical_Clock)` (ví dụ: `(clientA, 0)`, `(clientA, 1)`).
2. **Cấu trúc cây Logic**: Văn bản được lưu trữ dưới dạng một danh sách liên kết của các "Khối nội dung" (Items). Mỗi khối sẽ lưu trữ tham chiếu đến khối liền trước (left) và liền sau (right) của nó tại thời điểm chèn.
3. **Quá trình giải quyết xung đột**: 
   * Giả sử User A chèn chữ `X` sau chữ `A`, đồng thời User B chèn chữ `Y` sau chữ `A`.
   * Khi cập nhật giao thoa, cả hai trình duyệt đều biết `X` và `Y` có cùng điểm gốc bên trái (left origin) là `A`.
   * Yjs giải quyết bằng cách so sánh số ID của client (`clientA` vs `clientB`). Client nào có ID lớn hơn về mặt ký tự sẽ được xếp trước. Quy tắc này hoàn toàn thống nhất ở tất cả các máy, đảm bảo văn bản hiển thị ra giống hệt nhau mà không cần server can thiệp.
4. **Thu hồi tài nguyên (Garbage Collection)**: Khi một đoạn văn bản bị xoá, Yjs không xóa hoàn toàn nó khỏi bộ nhớ vì cần giữ cấu trúc liên kết để đối chiếu cho các cập nhật muộn hơn. Thay vào đó, nó đánh dấu phân đoạn đó là một **Tấm bia mộ (Tombstone)** bằng cách loại bỏ nội dung chuỗi ký tự chỉ giữ lại cấu trúc mốc định danh để tối ưu hóa bộ nhớ RAM.

---

## 3. Bản Đồ Tổng Quan Luồng Hoạt Động Thời Gian Thực

Khác với cơ chế **OT (Operational Transformation)** truyền thống (đòi hỏi một Server trung tâm xử lý xung đột phức tạp như Google Docs), hệ thống áp dụng **CRDT (Conflict-free Replicated Data Types)** thông qua thư viện **Yjs**. 

Yjs là một module framework chạy ở cả Frontend và Backend, cung cấp các cấu trúc dữ liệu chia sẻ (Shared Types) tự động hợp nhất (merge) các chỉnh sửa từ các thiết bị khác nhau mà không lo bị ghi đè hay mất dữ liệu.

### Sơ đồ luồng hoạt động tổng quát:

```
 ┌────────────────────────────────────────────────────────┐
 │                     Client Browser                     │
 │                                                        │
 │  ┌──────────────┐         ┌───────────┐                │
 │  │ Quill Editor │◄───────►│  yDoc     │                │
 │  │ Instance     │         │ (CRDT in  │                │
 │  └──────────────┘         │  Memory)  │                │
 │                           └─────┬─────┘                │
 │                                 │                      │
 │           ┌─────────────────────┴──────────┐           │
 │           ▼                                ▼           │
 │  ┌─────────────────┐              ┌─────────────────┐  │
 │  │ y-websocket     │              │ y-indexeddb     │  │
 │  │ Provider        │              │ Provider        │  │
 │  └────────┬────────┘              └────────┬────────┘  │
 │           │                                │           │
 └───────────┼────────────────────────────────┼───────────┘
             │ WS                             │ Sync
             ▼                                ▼
 ┌──────────────────────┐            ┌─────────────────┐
 │ WebSocket Server     │            │ local IndexedDB │
 │ (Backend Room Broker)│            │ (Offline DB)    │
 └──────────────────────┘            └─────────────────┘
```

---

## 2. Các Thành Phần Xử Lý Cộng Tác ở Frontend

### 2.1 Bộ não xử lý CRDT: `Y.Doc`
`Y.Doc` là đối tượng tài liệu Yjs chạy ngầm trong bộ nhớ trình duyệt. Nó có nhiệm vụ:
* Ghi lại lịch sử chỉnh sửa cục bộ.
* Tính toán sự khác biệt (diff) dựa trên thuật toán CRDT (cụ thể là thuật toán định danh cấu trúc cây độc nhất).
* Tự động giải quyết xung đột khi nhận các cập nhật từ máy khách khác thông qua mạng.

### 2.2 Trình soạn thảo Rich-text: `Quill JS` & `y-quill`
* **Quill JS** được lựa chọn làm trình soạn thảo nhờ tính năng gọn nhẹ, hỗ trợ định dạng phong phú (Rich Text) và cấu trúc Delta dễ ánh xạ.
* **y-quill** là adapter tạo mối liên kết 2 chiều (`binding`):
  * **Chiều xuôi (Local Input)**: Người dùng gõ phím -> Quill kích hoạt sự kiện thay đổi -> `y-quill` chuyển đổi thành các thao tác chèn/xóa (insert/delete) của Yjs Shared Type (`Y.Text`).
  * **Chiều ngược (Remote Update)**: WebSocket nhận thay đổi từ bên ngoài -> Cập nhật vào `Y.Text` -> `y-quill` tự động vẽ lại ký tự lên màn hình của Quill mà không làm mất vị trí con trỏ chuột của người dùng hiện tại.
* **Cấu hình Quill chống xung đột phím tắt**:
  ```javascript
  const quill = new Quill('#editor', {
    modules: {
      history: {
        userOnly: true // RẤT QUAN TRỌNG: Ngăn Ctrl+Z của user này hoàn tác (undo) nội dung gõ của user khác
      },
      cursors: true // Cho phép vẽ con trỏ chuột của người dùng khác
    },
    theme: 'bubble'
  });
  ```

### 2.3 Kết nối mạng: `y-websocket`
* Chuyển các byte nhị phân cập nhật trạng thái của Yjs Doc qua lại giữa các Client và Server.
* Ánh xạ **Tên phòng (Room Name)** tương ứng với mã cuộc họp `meetingId` (ví dụ: `ws://localhost:3000/collab/meetings/${meetingId}`).

---

## 3. Giải Pháp Đặc Thù: Chỉnh Sửa Transcript Theo Từng Giai Đoạn (Audio Segments)

### 3.1 Thách thức lớn
Dữ liệu tệp bản dịch trích xuất (Transcript) từ AI (Gemini/Whisper) được lưu trữ dưới dạng cấu trúc JSON phân đoạn (`segments`) trong PostgreSQL:
```json
{
  "segments": [
    {
      "id": "seg-1",
      "startTime": 0.0,
      "endTime": 5.2,
      "speaker": "Speaker 1",
      "text": "Xin chào mọi người, hôm nay chúng ta họp về dự án VDT."
    },
    {
      "id": "seg-2",
      "startTime": 5.5,
      "endTime": 12.0,
      "speaker": "Speaker 2",
      "text": "Chào anh Sơn, tôi đã chuẩn bị xong báo cáo backend."
    }
  ]
}
```
Nếu đưa toàn bộ văn bản này vào **một ô soạn thảo Quill duy nhất chứa một biến `Y.Text` khổng lồ**, ta sẽ gặp các vấn đề nghiêm trọng:
1. **Mất liên kết mốc thời gian**: Làm sao biết từ nào ứng với giây thứ mấy khi người dùng xóa bớt dòng, chèn thêm đoạn hoặc thay đổi vị trí?
2. **Khó nhận diện người nói (Speaker)**: Khi người dùng gộp hoặc chia dòng, làm thế nào để đồng bộ lại nhãn `Speaker 1`, `Speaker 2`?
3. **Hiệu năng kém**: Đồng bộ cả cuộc họp dài 2 tiếng với hàng nghìn câu nói sẽ tạo áp lực tải rất lớn cho trình duyệt.

### 3.2 Giải pháp Kiến trúc: Tổ chức Yjs dưới dạng Cấu trúc Phân đoạn (Segment-based Yjs Doc)

Thay vì dùng một `Y.Text` duy nhất, chúng ta tổ chức `Y.Doc` thành một **Cây cấu trúc** kết hợp giữa `Y.Map` và `Y.Text`:

1. Root của `Y.Doc` sẽ là một `Y.Map` chứa danh sách các phân đoạn.
2. Mỗi phân đoạn (Segment) là một `Y.Map` con chứa các thông tin: `id`, `startTime`, `endTime`, `speaker` và `text` (kiểu `Y.Text` độc lập).

```
                    ┌────────────────────────────┐
                    │        Y.Map (Root)        │
                    └──────────────┬─────────────┘
                                   │ key: 'segments'
                                   ▼
                    ┌────────────────────────────┐
                    │    Y.Array (segments)      │
                    └────────┬──────────────┬────┘
                             │              │
                             ▼ [Index: 0]   ▼ [Index: 1]
                    ┌────────────────┐ ┌────────────────┐
                    │ Y.Map (Segment)│ │ Y.Map (Segment)│
                    └──────┬─────────┘ └──────┬─────────┘
                           │                  │
         ┌─────────────────┼──────────┐       └─────────── ...
         │ key             │ type     │ value
         ├─────────────────┼──────────┼───────────────
         │ 'id'            │ Y.String │ 'seg-1'
         │ 'startTime'     │ Y.Float  │ 0.0
         │ 'endTime'       │ Y.Float  │ 5.2
         │ 'speaker'       │ Y.String │ 'Speaker 1'
         │ 'text'          │ Y.Text   │ [Shared Y.Text] ◄── Bind to Quill
         └─────────────────┴──────────┴───────────────
```

### 3.3 Mã nguồn minh họa khởi tạo & đồng bộ phân đoạn ở Frontend

Dưới đây là cách triển khai Frontend Next.js / React sử dụng Yjs để quản lý và chỉnh sửa theo phân đoạn:

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';

export class CollaborativeTranscriptManager {
  public ydoc: Y.Doc;
  private provider: WebsocketProvider;
  private segmentsArray: Y.Array<Y.Map<any>>;

  constructor(meetingId: string, wsUrl: string) {
    this.ydoc = new Y.Doc();
    
    // 1. Kết nối với Collab WebSocket Server
    this.provider = new WebsocketProvider(wsUrl, `meeting-${meetingId}`, this.ydoc);
    
    // 2. Khai báo Root Shared Type chứa danh sách segments
    this.segmentsArray = this.ydoc.getArray('segments');
  }

  /**
   * Khởi tạo dữ liệu ban đầu cho phòng họp (chỉ gọi bởi Host nếu Doc rỗng)
   */
  public initializeFromDB(initialSegments: any[]) {
    this.ydoc.transact(() => {
      // Xóa dữ liệu cũ nếu có
      if (this.segmentsArray.length === 0) {
        initialSegments.forEach(seg => {
          const segMap = new Y.Map();
          segMap.set('id', seg.id);
          segMap.set('startTime', seg.startTime);
          segMap.set('endTime', seg.endTime);
          segMap.set('speaker', seg.speaker);
          
          // Khởi tạo Y.Text cho nội dung của từng phân đoạn
          const ytext = new Y.Text();
          ytext.insert(0, seg.text);
          segMap.set('text', ytext);
          
          this.segmentsArray.push([segMap]);
        });
      }
    });
  }

  /**
   * Đăng ký lắng nghe sự thay đổi của danh sách phân đoạn để render giao diện
   */
  public subscribeToSegments(onUpdate: (segments: any[]) => void) {
    const handleUpdate = () => {
      const segmentsData = this.segmentsArray.map(segMap => {
        return {
          id: segMap.get('id'),
          startTime: segMap.get('startTime'),
          endTime: segMap.get('endTime'),
          speaker: segMap.get('speaker'),
          // text là kiểu Y.Text, lấy string thô để render preview
          text: segMap.get('text').toString(),
          rawYText: segMap.get('text') // Giữ lại object Y.Text để bind trực tiếp vào editor
        };
      });
      onUpdate(segmentsData);
    };

    this.segmentsArray.observeDeep(handleUpdate);
    return () => this.segmentsArray.unobserveDeep(handleUpdate);
  }

  /**
   * Gắn liên kết soạn thảo cộng tác cho một phân đoạn cụ thể với Quill Editor
   */
  public bindSegmentEditor(segmentId: string, quillInstance: Quill, cursorModule: any) {
    // Tìm Y.Map tương ứng với segmentId
    let targetSegMap: Y.Map<any> | null = null;
    for (let i = 0; i < this.segmentsArray.length; i++) {
      const segMap = this.segmentsArray.get(i);
      if (segMap.get('id') === segmentId) {
        targetSegMap = segMap;
        break;
      }
    }

    if (!targetSegMap) {
      console.error(`Segment ID ${segmentId} not found in Yjs Doc`);
      return null;
    }

    const ytext = targetSegMap.get('text') as Y.Text;

    // Tiến hành liên kết (Binding) 2 chiều với trình soạn thảo Quill cụ thể của phân đoạn đó
    const binding = new QuillBinding(ytext, quillInstance, this.provider.awareness);
    return binding;
  }

  /**
   * Thay đổi thông tin người nói (Speaker)
   */
  public updateSpeaker(segmentId: string, newSpeaker: string) {
    for (let i = 0; i < this.segmentsArray.length; i++) {
      const segMap = this.segmentsArray.get(i);
      if (segMap.get('id') === segmentId) {
        segMap.set('speaker', newSpeaker);
        break;
      }
    }
  }

  /**
   * Phân tách một phân đoạn làm hai tại vị trí nhất định (Split Segment)
   */
  public splitSegment(segmentId: string, splitTime: number, cursorIndex: number) {
    this.ydoc.transact(() => {
      for (let i = 0; i < this.segmentsArray.length; i++) {
        const segMap = this.segmentsArray.get(i);
        if (segMap.get('id') === segmentId) {
          const originalText = segMap.get('text') as Y.Text;
          const textVal = originalText.toString();
          
          const textBefore = textVal.substring(0, cursorIndex);
          const textAfter = textVal.substring(cursorIndex);
          
          // Cập nhật phân đoạn cũ
          const originalEndTime = segMap.get('endTime');
          segMap.set('endTime', splitTime);
          
          // Thay thế text của phân đoạn cũ
          originalText.delete(0, originalText.length);
          originalText.insert(0, textBefore);

          // Tạo phân đoạn mới
          const newSegMap = new Y.Map();
          newSegMap.set('id', `seg-${Date.now()}`);
          newSegMap.set('startTime', splitTime);
          newSegMap.set('endTime', originalEndTime);
          newSegMap.set('speaker', segMap.get('speaker'));
          
          const newText = new Y.Text();
          newText.insert(0, textAfter);
          newSegMap.set('text', newText);

          // Chèn phân đoạn mới ngay sau phân đoạn cũ
          this.segmentsArray.insert(i + 1, [newSegMap]);
          break;
        }
      }
    });
  }

  public destroy() {
    this.provider.destroy();
    this.ydoc.destroy();
  }
}
```

---

## 4. Cơ Chế Nhận Thức & Hiện Diện (Awareness & Presence)

Khi nhiều người cùng họp và sửa văn bản, việc biết **"Ai đang ở đâu"** và **"Ai đang sửa phân đoạn nào"** cực kỳ quan trọng để tăng tương tác và tránh việc sửa đè ý định.

### 4.1 Cơ chế hoạt động của Awareness
* Dữ liệu Awareness (Cursor, Tên người dùng, Màu sắc hiển thị) được truyền tải qua cổng WebSocket nhưng **không được lưu trữ** trong file tài liệu Y.Doc.
* Trạng thái này mang tính tạm thời (Ephemeral) và tự động bị huỷ bỏ (garbage collected) khi người dùng đóng trình duyệt hoặc mất kết nối mạng.

### 4.2 Triển khai Awareness định vị phân đoạn
Chúng ta gán thêm thuộc tính `currentSegmentId` vào trạng thái Awareness của máy khách:

```typescript
// Thiết lập thông tin cá nhân khi khởi tạo kết nối
const awareness = this.provider.awareness;

awareness.setLocalStateField('user', {
  name: 'Nguyễn Văn A',
  color: '#ff5733', // Màu sắc đại diện con trỏ
  email: 'a@gmail.com'
});

// Khi người dùng click chọn/tập trung con trỏ soạn thảo vào phân đoạn "seg-2"
function onFocusSegment(segmentId: string) {
  awareness.setLocalStateField('cursor', {
    focusedSegmentId: segmentId,
    index: 12 // Vị trí ký tự trong Quill
  });
}
```

### 4.3 Hiển thị UI danh sách người dùng online trong phòng họp
Lắng nghe thay đổi trạng thái Awareness của phòng để hiển thị danh sách avatar ở góc màn hình:

```typescript
awareness.on('change', () => {
  const onlineUsers: any[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (state.user) {
      onlineUsers.push({
        clientId,
        name: state.user.name,
        color: state.user.color,
        focusedSegmentId: state.cursor?.focusedSegmentId
      });
    }
  });
  // Trigger update state lên UI React / Next.js
  renderOnlineAvatars(onlineUsers);
});
```

---

## 5. Hỗ Trợ Ngoại Tuyến (Offline-first) với `y-indexeddb`

Tính năng hỗ trợ ngoại tuyến đảm bảo cuộc họp vẫn diễn ra thông suốt ngay cả khi mạng chập chờn.

### 5.1 Cấu hình Tải Tức Thì & Đồng Bộ Offline
Chúng ta tích hợp `y-indexeddb` ngay bên cạnh `y-websocket` ở client:

```typescript
import { IndexeddbPersistence } from 'y-indexeddb';

// Khởi chạy persistence lưu trữ cục bộ trên ổ cứng trình duyệt
const persistence = new IndexeddbPersistence(`meeting-${meetingId}`, this.ydoc);

// Lắng nghe sự kiện nạp thành công dữ liệu từ IndexedDB cục bộ
persistence.once('synced', () => {
  console.log('Dữ liệu đệm offline từ IndexedDB đã tải xong!');
  // Lúc này giao diện sẽ lập tức hiển thị toàn bộ nội dung bản dịch cũ
  // mà không cần đợi kết nối WebSocket phản hồi -> Tốc độ tải cực nhanh
});
```

### 5.2 Cơ chế đồng bộ hòa trộn (Merge Offline Data)
1. **Mất mạng (Offline)**: WebSocket bị ngắt kết nối. User sửa tiếp nội dung phân đoạn. Các byte cập nhật được ghi đè và lưu trữ trong IndexedDB của trình duyệt.
2. **Có mạng lại (Reconnect)**: WebSocket tự động kết nối lại tới Backend. `WebsocketProvider` sẽ lấy các bản ghi khác biệt chưa được đồng bộ từ IndexedDB và gửi lên Server.
3. Yjs Server nhận các byte cập nhật này, tự động so khớp mốc thời gian logic (Logical timestamps) của CRDT, và hòa trộn liền mạch các nội dung offline vào cơ sở dữ liệu chung mà không gây lỗi đè dữ liệu của người khác.

---

## 6. Giải Pháp Đồng Bộ Phía Backend (Database Persistence)

Server WebSocket (chạy bằng NestJS/Node.js) đóng vai trò là Host nhận kết nối WebSocket Room và chịu trách nhiệm lưu trữ định kỳ dữ liệu vào PostgreSQL (`structuredContent` JSONB).

### 6.1 Cơ chế Lưu trữ Tự động (Debounced Auto-save)
Để giảm tải cho Database PostgreSQL (tránh việc mỗi ký tự gõ gửi một câu lệnh SQL Update), ta thiết lập cơ chế **Debounce Save**:

```typescript
import * as Y from 'yjs';

const debounceTimeMs = 5000; // 5 giây không có thay đổi mới thì lưu DB một lần
let saveTimeout: NodeJS.Timeout | null = null;

// Lắng nghe thay đổi trên Yjs Doc ở phía Backend
ydoc.on('update', (updateBytes) => {
  // Reset timer
  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    // 1. Chuyển đổi Yjs Doc hiện tại thành cấu trúc JSON chuẩn của tệp Database
    const segmentsArray = ydoc.getArray('segments');
    const segmentsJSON = segmentsArray.map(segMap => ({
      id: segMap.get('id'),
      startTime: segMap.get('startTime'),
      endTime: segMap.get('endTime'),
      speaker: segMap.get('speaker'),
      text: segMap.get('text').toString()
    }));

    // 2. Cập nhật trường structured_content vào PostgreSQL
    await prisma.transcript.update({
      where: { audioFileId },
      data: {
        rawText: segmentsJSON.map(s => `${s.speaker}: ${s.text}`).join('\n'),
        structuredContent: { segments: segmentsJSON }
      }
    });
    console.log('Saved collaborative transcript state to Database.');
  }, debounceTimeMs);
});
```

### 6.2 Khởi dựng Yjs Doc từ Cơ sở dữ liệu (Rehydration)
Khi người dùng đầu tiên tham gia phòng họp (`Room`), Server sẽ kiểm tra bộ nhớ đệm:
* Nếu Room chưa tồn tại trong RAM Server:
  1. Tải bản ghi `Transcript` từ PostgreSQL.
  2. Tạo một đối tượng `Y.Doc` mới trên Server.
  3. Đọc mảng `segments` từ trường `structuredContent` JSONB và chèn vào `ydoc.getArray('segments')`.
  4. Lưu giữ `Y.Doc` này trên RAM Server để tiếp nhận các kết nối Client tiếp theo.
* Nếu Room đã tồn tại trong RAM Server: Chỉ việc cấp phát kết nối WebSocket kết nối trực tiếp vào `Y.Doc` hiện hành.
* Khi toàn bộ người dùng thoát khỏi phòng họp: Tiến hành lưu lần cuối vào PostgreSQL và giải phóng (clean-up) `Y.Doc` khỏi bộ nhớ RAM để tối ưu tài nguyên Server.

---

## 7. Cơ Chế Phân Quyền Chỉnh Sửa Dựa Trên Meeting Role

Để bảo vệ tính toàn vẹn của bản dịch, hệ thống tận dụng trực tiếp mô hình phân quyền thành viên của Cuộc họp (Meeting Member Roles) có chứa file ghi âm đó: `HOST`, `EDITOR`, và `VIEWER`.

* **HOST & EDITOR**: Được cấp quyền **Read/Write** (Đọc và ghi dữ liệu soạn thảo).
* **VIEWER**: Chỉ được cấp quyền **Read-Only** (Đọc dữ liệu, xem vị trí con trỏ chuột của người khác, không được phép chỉnh sửa).

### Quy trình kiểm soát quyền ở cả hai đầu (Frontend & Backend):

```
Client (Browser)        Collab Gateway       Meeting Service       Y.Doc (RAM Room)
       │                      │                     │                     │
       ├─────WS Connection───►│                     │                     │
       │  (JWT, meetingId)    │                     │                     │
       │                      ├────Check Role──────►│                     │
       │                      │  (userId, meetingId)│                     │
       │                      │                     │                     │
       │                      │◄───Return Role──────┤                     │
       │                      │ (HOST/EDITOR/VIEWER)│                     │
       │                      │                                           │
       │  [Case 1: Unauthorized / Not a member]                           │
       │◄────Close (4003)─────┤                                           │
       │                      │                                           │
       │  [Case 2: Role is VIEWER]                                        │
       │◄───Conn OK (ReadOnly)┤                                           │
       │                      ├─────Register Broadcast stream────────────►│
       │◄─────────────────────┼───────────────────────────────────────────┤
       │                      │       (Send initial Y.Doc state)          │
       │                      │                                           │
       │  [Case 3: Role is HOST or EDITOR]                                │
       │◄───Conn OK (Writable)┤                                           │
       │                      ├─────Register Read/Write stream───────────►│
       │                      │                                           │
       │  [Viewer tries to write / edit]                                  │
       ├─────Send Update─────►│                                           │
       │                      ├─Check role (readOnly == true)             │
       │                      ├─Drop / Reject Update frame                │
       │◄────Send Error───────┤                                           │
```

### 7.1 Thực thi phân quyền phía Backend (WebSocket Gateway)
Khi thiết lập kết nối WebSocket thông qua `y-websocket` server, chúng ta can thiệp vào tiến trình bắt tay (handshake) và xử lý gói tin:

```typescript
// Trong nestjs-websocket-gateway.ts hoặc y-websocket-server
wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
  const { token, meetingId } = parseUrlParams(req.url);
  
  // 1. Xác thực người dùng qua JWT
  const user = await jwtService.verifyAsync(token);
  
  // 2. Gọi sang Meeting Service hoặc truy vấn trực tiếp DB để lấy vai trò thành viên
  const member = await prisma.meetingMember.findUnique({
    where: { meetingId_userId: { meetingId, userId: user.id } }
  });

  if (!member) {
    ws.close(4003, 'Forbidden: Bạn không phải thành viên cuộc họp.');
    return;
  }

  // Gán thông tin vai trò vào connection socket
  ws.userRole = member.role; // 'HOST' | 'EDITOR' | 'VIEWER'

  // 3. Thiết lập kết nối Yjs Room
  const room = getOrCreateYjsRoom(meetingId);
  
  // Lắng nghe gói tin từ client gửi lên
  ws.on('message', (message: Buffer) => {
    // Nếu là VIEWER nhưng lại gửi gói tin sửa đổi tài liệu (chứa byte update của Yjs)
    if (ws.userRole === 'VIEWER' && isYjsUpdateMessage(message)) {
      console.warn(`Cảnh báo bảo mật: User ${user.name} (VIEWER) cố gắng sửa đổi tài liệu phòng ${meetingId}. Đã drop gói tin.`);
      // Trả lại lỗi hoặc đóng kết nối nếu cố tình vi phạm nhiều lần
      ws.send(JSON.stringify({ type: 'error', message: 'Bạn không có quyền chỉnh sửa tài liệu.' }));
      return; 
    }
    
    // Nếu là HOST hoặc EDITOR thì tiến hành xử lý/phát tán gói tin bình thường
    processYjsMessage(message, room, ws);
  });
});
```

### 7.2 Thực thi phân quyền phía Frontend (Next.js)
* **Chế độ đọc (ReadOnly)**: Khi nhận được cấu hình vai trò `VIEWER` từ session đăng nhập, Next.js frontend sẽ vô hiệu hoá khả năng tương tác của ô soạn thảo bằng cách chuyển Quill sang chế độ `readOnly`:
  ```javascript
  quill.enable(false); // Vô hiệu hoá soạn thảo trực tiếp trên giao diện
  ```
* Ẩn các nút điều khiển nhạy cảm (như nút Split Segment, Delete Segment, Edit Speaker).

---

## 8. Chiến Lược Lưu Lịch Sử Phiên Bản & Rollback Bản Dịch

Trong môi trường cộng tác liên tục, việc ghi lại lịch sử thay đổi để truy vết ("Ai đã sửa cái gì") và khả năng **khôi phục về một phiên bản cũ (Rollback)** là tính năng bắt buộc.

### 8.1 Thách thức trong CRDT
Nếu khôi phục văn bản bằng cách chèn đè nội dung chuỗi thô từ cơ sở dữ liệu lên giao diện, toàn bộ cây mốc định danh logic logic-timestamp của Yjs sẽ bị phá vỡ, gây xung đột nặng nề cho các client khác đang mở tài liệu (hệ thống sẽ cố hòa trộn chuỗi cũ và chuỗi mới tạo ra văn bản rác lặp từ).

### 8.2 Giải pháp đề xuất: Snapshot-based Versioning

Chúng ta sử dụng cơ chế lưu trữ **Vector trạng thái (State Vector)** và **Bản chụp nhị phân (State Update Snapshot)** của Yjs để lưu lịch sử:

1. **Lưu phiên bản (Commit Version)**:
   * Bản ghi lịch sử sẽ được tạo tự động sau mỗi khoảng thời gian (ví dụ: mỗi 30 phút nếu có thay đổi) hoặc do người dùng (HOST) chủ động lưu thủ công (Đặt tên phiên bản như "Bản lưu trước khi duyệt").
   * Để lưu một phiên bản, ta trích xuất bản chụp nhị phân hiện hành của tài liệu bằng cách gọi:
     ```javascript
     const snapshotBytes = Y.encodeStateAsUpdate(ydoc); // Trả về Uint8Array đại diện cho toàn bộ trạng thái tài liệu
     ```
   * Chuyển đổi `Uint8Array` thành định dạng Base64 hoặc lưu trực tiếp dưới dạng trường dữ liệu `bytea` (Binary) trong bảng `TranscriptVersion` của PostgreSQL.

#### Cấu trúc bảng lưu trữ lịch sử (`TranscriptVersion`):
```prisma
model TranscriptVersion {
  id           String   @id @default(uuid()) @db.Uuid
  transcriptId Int      @map("transcript_id")
  versionName  String   @map("version_name") // ví dụ: "Bản sao lưu tự động lúc 10h"
  snapshot     Bytes    @map("snapshot") // Dữ liệu nhị phân Uint8Array lưu trạng thái Y.Doc
  authorId     Int      @map("author_id") // ID người tạo phiên bản
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("transcript_versions")
}
```

2. **So sánh phiên bản cũ (Diff/Preview Version)**:
   * Khi người dùng muốn xem lại phiên bản cũ: Trình duyệt tải dữ liệu `snapshot` nhị phân của phiên bản đó từ Database.
   * Khởi tạo một đối tượng `Y.Doc` tạm thời (chạy ngầm, không kết nối WebSocket):
     ```javascript
     const tempDoc = new Y.Doc();
     Y.applyUpdate(tempDoc, snapshotBytes);
     ```
   * Xuất ra chuỗi hoặc mảng segment để hiển thị so sánh (Side-by-side Diff) trực quan trên giao diện:
     ```javascript
     const oldText = tempDoc.getArray('segments').map(s => s.get('text').toString());
     ```

3. **Cơ chế khôi phục phiên bản (Rollback)**:
   * Khi Host nhấn "Khôi phục về phiên bản này":
   * Server Collaboration Gateway sẽ đọc dữ liệu `snapshotBytes` của phiên bản được chọn từ Database.
   * Để khôi phục mà không làm hỏng tính năng cộng tác thời gian thực của các máy đang kết nối, chúng ta sử dụng **Yjs Transaction** để thay đổi trạng thái tài liệu hiện tại khớp với trạng thái của snapshot (thay vì huỷ doc tạo lại):

```typescript
// Thực hiện Rollback trên Y.Doc đang hoạt động tại Server Collab
public rollbackToSnapshot(activeYDoc: Y.Doc, snapshotBytes: Uint8Array) {
  // 1. Tạo Doc tạm đại diện cho trạng thái cần khôi phục
  const targetDoc = new Y.Doc();
  Y.applyUpdate(targetDoc, snapshotBytes);

  const activeSegments = activeYDoc.getArray('segments');
  const targetSegments = targetDoc.getArray('segments');

  // 2. Chạy một Transaction duy nhất để đồng bộ các thay đổi
  activeYDoc.transact(() => {
    // Xoá tất cả các phân đoạn hiện tại
    activeSegments.delete(0, activeSegments.length);
    
    // Tái tạo các phân đoạn từ targetDoc sang activeYDoc
    for (let i = 0; i < targetSegments.length; i++) {
      const targetSegMap = targetSegments.get(i);
      
      const newSegMap = new Y.Map();
      newSegMap.set('id', targetSegMap.get('id'));
      newSegMap.set('startTime', targetSegMap.get('startTime'));
      newSegMap.set('endTime', targetSegMap.get('endTime'));
      newSegMap.set('speaker', targetSegMap.get('speaker'));
      
      // Copy nội dung text
      const newText = new Y.Text();
      newText.insert(0, targetSegMap.get('text').toString());
      newSegMap.set('text', newText);

      activeSegments.push([newSegMap]);
    }
  });

  // Giao dịch khôi phục này sẽ tự động mã hoá thành bản cập nhật chuẩn của Yjs
  // và gửi phát tán đến mọi Client đang kết nối. Giao diện của họ sẽ cập nhật ngay lập tức.
  console.log('Rollback completed successfully and broadcasted to all users.');
}
```

* **Ưu điểm vượt trội**: 
  * Người dùng không bị ngắt kết nối WebSocket khi khôi phục.
  * Phép so sánh và phục hồi diễn ra trong một `transact`, đảm bảo tất cả lịch sử con trỏ chuột của người dùng khác tự động nhảy về vị trí hợp lý tương ứng với trạng thái văn bản được phục hồi.
}
